import { randomUUID } from 'node:crypto'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import type { Actor, Tx } from '@/server/db'
import { generatePersonalAccessToken } from '@/server/auth/tokens'
import { personalAccessToken } from '@/server/db/schema'

/**
 * Personal access tokens, for MCP clients.
 *
 * Personal, not administrative: a token acts as the member who made it, and
 * everything it can do is the intersection of that member's capabilities with
 * its own scopes. So this lives in a person's own settings and an admin has no
 * screen for somebody else's tokens -- being able to mint credentials that act
 * as a colleague is not a power a tenant admin needs.
 */

export const SCOPES = [
  'workshops:read',
  'workshops:write',
  'module_types:read',
  'module_types:write',
  'tenant:read',
] as const

export type Scope = (typeof SCOPES)[number]

/**
 * Deliberately absent: anything to do with members.
 *
 * An MCP client must never be able to invite users or promote admins. That is
 * a decision to hold even when somebody asks for it -- so there is no scope to
 * grant, rather than a scope that is merely unused.
 */

export type TokenRow = {
  id: string
  name: string
  /** The public half, so a person can tell which token a log line is about. */
  tokenId: string
  scopes: string[]
  lastUsedAt: Date | null
  createdAt: Date
}

export class TokenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TokenError'
  }
}

export async function listTokens(tx: Tx, actor: Actor): Promise<TokenRow[]> {
  return tx
    .select({
      id: personalAccessToken.id,
      name: personalAccessToken.name,
      tokenId: personalAccessToken.tokenId,
      scopes: personalAccessToken.scopes,
      lastUsedAt: personalAccessToken.lastUsedAt,
      createdAt: personalAccessToken.createdAt,
    })
    .from(personalAccessToken)
    .where(
      and(
        eq(personalAccessToken.memberId, actor.memberId),
        // A revoked token is gone as far as its owner is concerned; the row
        // stays so an audit trail still resolves the id it mentions.
        isNull(personalAccessToken.revokedAt),
      ),
    )
    .orderBy(asc(personalAccessToken.createdAt))
}

/** The secret is returned once and never stored -- only its hash is. */
export async function createToken(
  tx: Tx,
  actor: Actor,
  input: { name: string; scopes: string[] },
): Promise<{ token: string; row: TokenRow }> {
  const name = input.name.trim()
  if (!name)
    throw new TokenError('Gib dem Token einen Namen — sonst weißt du später nicht, wofür es war.')
  if (name.length > 80) throw new TokenError('Der Name darf höchstens 80 Zeichen haben.')

  const scopes = [...new Set(input.scopes)]
  const unknown = scopes.filter((scope) => !SCOPES.includes(scope as Scope))
  if (unknown.length > 0) {
    throw new TokenError(`Unbekannte Bereiche: ${unknown.join(', ')}.`)
  }
  if (scopes.length === 0) {
    throw new TokenError('Ein Token ohne Bereiche kann nichts. Wähl mindestens einen.')
  }

  const generated = generatePersonalAccessToken()
  const rows = await tx
    .insert(personalAccessToken)
    .values({
      id: randomUUID(),
      memberId: actor.memberId,
      name,
      tokenId: generated.tokenId,
      tokenHash: generated.tokenHash,
      scopes,
    })
    .returning({
      id: personalAccessToken.id,
      name: personalAccessToken.name,
      tokenId: personalAccessToken.tokenId,
      scopes: personalAccessToken.scopes,
      lastUsedAt: personalAccessToken.lastUsedAt,
      createdAt: personalAccessToken.createdAt,
    })

  return { token: generated.token, row: rows[0]! }
}

/**
 * Revokes rather than deletes.
 *
 * The row is what an audit event's token id resolves against, and "who did
 * this" is a question people ask about tokens more than about anything else.
 */
export async function revokeToken(tx: Tx, actor: Actor, id: string): Promise<void> {
  const updated = await tx
    .update(personalAccessToken)
    .set({ revokedAt: sql`now()` })
    .where(
      and(
        eq(personalAccessToken.id, id),
        // Scoped to the owner, not just the tenant: a colleague's token is
        // not yours to revoke.
        eq(personalAccessToken.memberId, actor.memberId),
        isNull(personalAccessToken.revokedAt),
      ),
    )
    .returning({ id: personalAccessToken.id })

  if (!updated[0]) throw new TokenError('Dieses Token gibt es nicht mehr.')
}
