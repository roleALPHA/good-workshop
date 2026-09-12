import { randomUUID } from 'node:crypto'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { memberIdOf, type Actor, type Tx } from '@/server/db'
import { generatePersonalAccessToken } from '@/server/auth/tokens'
import { personalAccessToken } from '@/server/db/schema'
import { DomainError } from '@/domain/errors'

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
  /** Constrained to SCOPES, not merely stored as text: the label for each is
   *  looked up by value, and an unknown one would render as its own key. */
  scopes: Scope[]
  lastUsedAt: Date | null
  createdAt: Date
}

/** Named because the limit now reaches the person as a number in a sentence. */
const MAX_TOKEN_NAME_LENGTH = 80

export class TokenError extends DomainError {}

export async function listTokens(tx: Tx, actor: Actor): Promise<TokenRow[]> {
  // The cast is what createToken already guarantees: it rejects any scope that
  // is not in SCOPES before the row is written.
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
        eq(personalAccessToken.memberId, memberIdOf(actor)),
        // A revoked token is gone as far as its owner is concerned; the row
        // stays so an audit trail still resolves the id it mentions.
        isNull(personalAccessToken.revokedAt),
      ),
    )
    .orderBy(asc(personalAccessToken.createdAt)) as Promise<TokenRow[]>
}

/** The secret is returned once and never stored -- only its hash is. */
export async function createToken(
  tx: Tx,
  actor: Actor,
  input: { name: string; scopes: string[] },
): Promise<{ token: string; row: TokenRow }> {
  const name = input.name.trim()
  if (!name) throw new TokenError('token.nameRequired')
  if (name.length > MAX_TOKEN_NAME_LENGTH)
    throw new TokenError('token.nameTooLong', { max: MAX_TOKEN_NAME_LENGTH })

  const scopes = [...new Set(input.scopes)]
  const unknown = scopes.filter((scope) => !SCOPES.includes(scope as Scope))
  if (unknown.length > 0) {
    throw new TokenError('token.unknownScopes', { scopes: unknown.join(', ') })
  }
  if (scopes.length === 0) {
    throw new TokenError('token.noScopes')
  }

  const generated = generatePersonalAccessToken()
  const rows = await tx
    .insert(personalAccessToken)
    .values({
      id: randomUUID(),
      memberId: memberIdOf(actor),
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

  // Safe by the check above: every scope was matched against SCOPES.
  return { token: generated.token, row: rows[0]! as TokenRow }
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
        eq(personalAccessToken.memberId, memberIdOf(actor)),
        isNull(personalAccessToken.revokedAt),
      ),
    )
    .returning({ id: personalAccessToken.id })

  if (!updated[0]) throw new TokenError('token.gone')
}
