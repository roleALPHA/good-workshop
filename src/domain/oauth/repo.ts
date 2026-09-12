import { randomUUID } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
import type { Tx } from '@/server/db'
import { oauthClient, oauthGrant, oauthToken } from '@/server/db/schema'
import { generateOAuthToken, generateSecret, hashSecret } from '@/server/auth/tokens'
import { DomainError } from '@/domain/errors'
import type { Scope } from '@/domain/tenant/tokens'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTHORIZATION_CODE_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  registrableRedirectUri,
} from './rules'

export class OAuthError extends DomainError {}

export type RegisteredClient = {
  id: string
  clientKey: string
  name: string
  redirectUris: string[]
  /** Returned once, at registration, and never readable again. */
  secret?: string
}

/**
 * Registration, per RFC 7591, and deliberately open.
 *
 * The MCP specification expects a client the operator has never heard of to be
 * able to start the flow, so there is no gate here. What makes that acceptable
 * is that a row grants NOTHING: it is a name and a redirect target. Every
 * actual permission is still handed over by a person at the consent screen, and
 * a registration nobody consents to is a row that does nothing forever.
 */
export async function registerClient(
  tx: Tx,
  input: { name: string; redirectUris: string[]; confidential: boolean },
): Promise<RegisteredClient> {
  const name = input.name.trim().slice(0, 120) || 'MCP client'
  const uris = input.redirectUris.filter((uri) => registrableRedirectUri(uri))

  // Refused rather than silently narrowed: a client that registered with no
  // usable target would fail later, at the redirect, where the error has no
  // way back to whoever configured it.
  if (uris.length === 0) throw new OAuthError('oauth.noRedirectUri')

  const secret = input.confidential ? generateSecret(32) : undefined
  const row = {
    id: randomUUID(),
    clientKey: generateSecret(18),
    secretHash: secret ? hashSecret(secret) : null,
    name,
    redirectUris: uris,
  }
  await tx.insert(oauthClient).values(row)

  return { id: row.id, clientKey: row.clientKey, name, redirectUris: uris, secret }
}

export async function findClient(tx: Tx, clientKey: string) {
  const rows = await tx
    .select({
      id: oauthClient.id,
      name: oauthClient.name,
      redirectUris: oauthClient.redirectUris,
      secretHash: oauthClient.secretHash,
    })
    .from(oauthClient)
    .where(eq(oauthClient.clientKey, clientKey))
    .limit(1)
  return rows[0] ?? null
}

/** The code handed back through the browser. Short-lived and single-use. */
export async function createAuthorizationCode(
  tx: Tx,
  input: {
    clientId: string
    memberId: string
    scopes: Scope[]
    resource: string
    redirectUri: string
    codeChallenge: string
  },
): Promise<string> {
  const code = generateSecret(32)
  await tx.insert(oauthGrant).values({
    id: randomUUID(),
    codeHash: hashSecret(code),
    clientId: input.clientId,
    memberId: input.memberId,
    scopes: input.scopes,
    resource: input.resource,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    expiresAt: sql`now() + interval '${sql.raw(String(AUTHORIZATION_CODE_TTL_SECONDS))} seconds'`,
  })
  return code
}

/**
 * Spends a code, or returns null.
 *
 * `used_at is null` is part of the UPDATE rather than a check before it: two
 * token requests racing on one code would both pass a read-then-write, and the
 * loser of that race is an attacker who replayed a code they intercepted.
 * Postgres decides, once.
 */
export async function redeemAuthorizationCode(tx: Tx, code: string) {
  const rows = await tx
    .update(oauthGrant)
    .set({ usedAt: sql`now()` })
    .where(
      and(
        eq(oauthGrant.codeHash, hashSecret(code)),
        isNull(oauthGrant.usedAt),
        sql`${oauthGrant.expiresAt} > now()`,
      ),
    )
    .returning({
      clientId: oauthGrant.clientId,
      memberId: oauthGrant.memberId,
      scopes: oauthGrant.scopes,
      resource: oauthGrant.resource,
      redirectUri: oauthGrant.redirectUri,
      codeChallenge: oauthGrant.codeChallenge,
    })
  return rows[0] ?? null
}

export type IssuedTokens = {
  accessToken: string
  refreshToken?: string
  expiresIn: number
  scopes: string[]
}

export async function issueTokens(
  tx: Tx,
  input: {
    clientId: string
    memberId: string
    scopes: string[]
    resource: string
    withRefresh: boolean
  },
): Promise<IssuedTokens> {
  const access = generateOAuthToken('access')
  await tx.insert(oauthToken).values({
    id: randomUUID(),
    tokenKey: access.tokenKey,
    secretHash: access.secretHash,
    kind: 'access',
    clientId: input.clientId,
    memberId: input.memberId,
    scopes: input.scopes,
    resource: input.resource,
    expiresAt: sql`now() + interval '${sql.raw(String(ACCESS_TOKEN_TTL_SECONDS))} seconds'`,
  })

  let refreshToken: string | undefined
  if (input.withRefresh) {
    const refresh = generateOAuthToken('refresh')
    await tx.insert(oauthToken).values({
      id: randomUUID(),
      tokenKey: refresh.tokenKey,
      secretHash: refresh.secretHash,
      kind: 'refresh',
      clientId: input.clientId,
      memberId: input.memberId,
      scopes: input.scopes,
      resource: input.resource,
      expiresAt: sql`now() + interval '${sql.raw(String(REFRESH_TOKEN_TTL_SECONDS))} seconds'`,
    })
    refreshToken = refresh.token
  }

  return {
    accessToken: access.token,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    scopes: input.scopes,
  }
}

/**
 * Spends a refresh token and returns what it stood for.
 *
 * Rotated, not reused: the old row is revoked in the same statement that reads
 * it, so a stolen refresh token works at most once — and the theft shows up as
 * the legitimate client suddenly being logged out.
 */
export async function redeemRefreshToken(tx: Tx, tokenKey: string, secretHash: string) {
  const rows = await tx
    .update(oauthToken)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(oauthToken.tokenKey, tokenKey),
        eq(oauthToken.secretHash, secretHash),
        eq(oauthToken.kind, 'refresh'),
        isNull(oauthToken.revokedAt),
        sql`${oauthToken.expiresAt} > now()`,
      ),
    )
    .returning({
      clientId: oauthToken.clientId,
      memberId: oauthToken.memberId,
      scopes: oauthToken.scopes,
      resource: oauthToken.resource,
    })
  return rows[0] ?? null
}
