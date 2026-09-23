import type pg from 'pg'
import {
  generateOperatorOAuthToken,
  generateSecret,
  hashSecret,
  parseOperatorOAuthToken,
} from '@/server/auth/tokens'
import {
  ACCESS_TOKEN_TTL_SECONDS,
  AUTHORIZATION_CODE_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  registrableRedirectUri,
} from '@/domain/oauth/rules'
import { OAuthError, type OAuthStore } from '@/domain/oauth/store'
import type { OpenStore } from '@/server/oauth/endpoints'
import { operatorConsoleEnabled, operatorDb } from './db'
import { isOperatorScope, type OperatorScope } from './scopes'

/**
 * The operator console's authorization server, as an OAuthStore.
 *
 * Every method is one `app.op_*` call, because gw_operator has EXECUTE on
 * those functions and no grant on any table. That is not a style choice here
 * the way an ORM would be: it is the console's entire permission model, and a
 * `select ... from operator_token` in this file would simply be refused.
 *
 * The flow above it -- PKCE, the single-use code, refresh rotation, the
 * audience check -- is upstream's, unchanged. What this file supplies is
 * where the rows are and what the subject is: an operator, not a member.
 */

type Db = Pick<pg.Pool, 'query'>

export function operatorStore(db: Db): OAuthStore {
  return {
    async registerClient(input) {
      const name = input.name.trim().slice(0, 120) || 'MCP client'
      const uris = input.redirectUris.filter((uri) => registrableRedirectUri(uri))

      // Refused rather than silently narrowed: a client that registered with
      // no usable target would fail later, at the redirect, where the error
      // has no way back to whoever configured it.
      if (uris.length === 0) throw new OAuthError('oauth.noRedirectUri')

      const secret = input.confidential ? generateSecret(32) : undefined
      const clientKey = generateSecret(18)
      const { rows } = await db.query('select app.op_oauth_register($1,$2,$3,$4) as id', [
        clientKey,
        secret ? hashSecret(secret) : null,
        name,
        uris,
      ])
      return { id: rows[0].id, clientKey, name, redirectUris: uris, secret }
    },

    async findClient(clientKey) {
      const { rows } = await db.query('select * from app.op_oauth_client($1)', [clientKey])
      const row = rows[0]
      return row
        ? {
            id: row.id,
            name: row.name,
            redirectUris: row.redirect_uris,
            secretHash: row.secret_hash,
          }
        : null
    },

    async redeemAuthorizationCode(code) {
      const { rows } = await db.query('select * from app.op_oauth_redeem_code($1)', [
        hashSecret(code),
      ])
      const row = rows[0]
      return row
        ? {
            clientId: row.client_id,
            subjectId: row.operator_id,
            scopes: row.scopes,
            resource: row.resource,
            redirectUri: row.redirect_uri,
            codeChallenge: row.code_challenge,
          }
        : null
    },

    async issueTokens(input) {
      const issue = async (kind: 'access' | 'refresh', seconds: number) => {
        const minted = generateOperatorOAuthToken(kind)
        await db.query('select app.op_oauth_issue($1,$2,$3,$4,$5,$6,$7,$8)', [
          input.clientId,
          input.subjectId,
          kind,
          minted.tokenKey,
          minted.secretHash,
          input.scopes,
          input.resource,
          seconds,
        ])
        return minted.token
      }

      return {
        accessToken: await issue('access', ACCESS_TOKEN_TTL_SECONDS),
        ...(input.withRefresh
          ? { refreshToken: await issue('refresh', REFRESH_TOKEN_TTL_SECONDS) }
          : {}),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        scopes: input.scopes,
      }
    },

    async redeemRefreshToken(tokenKey, secret) {
      const { rows } = await db.query('select * from app.op_oauth_redeem_refresh($1,$2)', [
        tokenKey,
        hashSecret(secret),
      ])
      const row = rows[0]
      return row
        ? {
            clientId: row.client_id,
            subjectId: row.operator_id,
            scopes: row.scopes,
            resource: row.resource,
          }
        : null
    },

    async revoke(tokenKey, secret) {
      await db.query('select app.op_oauth_revoke($1,$2)', [tokenKey, hashSecret(secret)])
    },

    parseToken: parseOperatorOAuthToken,
  }
}

/**
 * The code the consent screen writes. Not on the port.
 *
 * The port is what the three machine-to-machine endpoints need; minting a code
 * is what the one screen with a person in front of it does, and the two
 * servers do it from different places with different sessions.
 */
export async function createOperatorAuthorizationCode(
  db: Db,
  input: {
    clientId: string
    operatorId: string
    scopes: OperatorScope[]
    resource: string
    redirectUri: string
    codeChallenge: string
  },
): Promise<string> {
  const code = generateSecret(32)
  await db.query('select app.op_oauth_code($1,$2,$3,$4,$5,$6,$7,$8)', [
    hashSecret(code),
    input.clientId,
    input.operatorId,
    input.scopes,
    input.resource,
    input.redirectUri,
    input.codeChallenge,
    AUTHORIZATION_CODE_TTL_SECONDS,
  ])
  return code
}

/**
 * Opens the console's store, or refuses.
 *
 * No tenant to resolve and no transaction to hold: each `app.op_*` function is
 * atomic on its own, and there is exactly one operator installation. The only
 * reason this can answer null is a process that is not the console -- the
 * public web container has these routes on disk and must not serve them.
 */
export const openOperatorStore: OpenStore = async () =>
  operatorConsoleEnabled() ? (use) => use(operatorStore(operatorDb())) : null

export type OperatorConnection = {
  clientId: string
  name: string
  scopes: OperatorScope[]
  connectedAt: Date
  lastUsedAt: Date | null
  live: number
}

/**
 * The clients currently holding something, one row each.
 *
 * Not the tokens. An access token lasts an hour, so a connected client mints
 * twenty-four a day, and a list of those answers no question anybody has. What
 * somebody wants to know at this screen is which clients can act as them, and
 * the answer is a short list with a way to end each one.
 */
export async function listOperatorConnections(
  db: Db,
  operatorId: string,
): Promise<OperatorConnection[]> {
  const { rows } = await db.query('select * from app.op_connections($1)', [operatorId])
  return rows.map((row) => ({
    clientId: row.client_id,
    name: row.name,
    // Filtered rather than cast, like the token scopes: a scope dropped from
    // the vocabulary must stop meaning anything, not linger on an old row.
    scopes: ((row.scopes ?? []) as string[]).filter(isOperatorScope),
    connectedAt: row.connected_at,
    lastUsedAt: row.last_used_at,
    live: Number(row.live),
  }))
}

/** Revokes every token a client holds. Returns how many there were. */
export async function disconnectOperatorClient(
  db: Db,
  operatorId: string,
  clientId: string,
): Promise<number> {
  const { rows } = await db.query('select app.op_disconnect($1,$2) as count', [
    operatorId,
    clientId,
  ])
  return Number(rows[0].count)
}
