import { and, eq, gt, isNull, sql } from 'drizzle-orm'
import { memberIdOf, type Actor, type Tx } from '@/server/db'
import { oauthClient, oauthToken } from '@/server/db/schema'

/**
 * The clients a person has connected over OAuth, and taking that back.
 *
 * A connection is not a row of its own: it is whatever live tokens a member
 * holds for a client. Listing groups them, revoking marks them all -- access
 * and refresh alike, so the client can neither keep working nor quietly mint a
 * new access token. app.resolve_oauth_token refuses a revoked token on the
 * very next request.
 *
 * Always the actor's own tokens. Like a personal access token, a connection
 * acts as the person who approved it; a colleague's is not yours to see or end.
 */

export type Connection = {
  clientId: string
  name: string
  scopes: string[]
  /** When the oldest live token of this client was issued. */
  connectedAt: Date
  /** The most recent request with any of its tokens, if any. */
  lastUsedAt: Date | null
}

export async function listConnections(tx: Tx, actor: Actor): Promise<Connection[]> {
  const tokens = await tx
    .select({
      clientId: oauthToken.clientId,
      name: oauthClient.name,
      scopes: oauthToken.scopes,
      createdAt: oauthToken.createdAt,
      lastUsedAt: oauthToken.lastUsedAt,
    })
    .from(oauthToken)
    .innerJoin(oauthClient, eq(oauthClient.id, oauthToken.clientId))
    .where(live(actor))

  // Grouped here rather than in SQL: a person holds a handful of tokens, and
  // merging scope arrays in Postgres needs more query than it saves.
  const byClient = new Map<string, Connection>()
  for (const token of tokens) {
    const seen = byClient.get(token.clientId)
    if (!seen) {
      byClient.set(token.clientId, {
        clientId: token.clientId,
        name: token.name,
        scopes: [...new Set(token.scopes)],
        connectedAt: token.createdAt,
        lastUsedAt: token.lastUsedAt,
      })
      continue
    }
    seen.scopes = [...new Set([...seen.scopes, ...token.scopes])]
    if (token.createdAt < seen.connectedAt) seen.connectedAt = token.createdAt
    if (token.lastUsedAt && (!seen.lastUsedAt || token.lastUsedAt > seen.lastUsedAt)) {
      seen.lastUsedAt = token.lastUsedAt
    }
  }
  return [...byClient.values()].sort((a, b) => a.name.localeCompare(b.name))
}

/** Returns how many tokens were revoked; zero when there was nothing of yours to end. */
export async function revokeConnection(tx: Tx, actor: Actor, clientId: string): Promise<number> {
  const revoked = await tx
    .update(oauthToken)
    .set({ revokedAt: sql`now()` })
    .where(and(eq(oauthToken.clientId, clientId), live(actor)))
    .returning({ id: oauthToken.id })
  return revoked.length
}

function live(actor: Actor) {
  return and(
    eq(oauthToken.memberId, memberIdOf(actor)),
    isNull(oauthToken.revokedAt),
    gt(oauthToken.expiresAt, sql`now()`),
  )
}
