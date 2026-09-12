import { sql } from 'drizzle-orm'
import type { Actor } from '@/server/db'
import { withoutTenant, withTenant } from '@/server/db'
import { personalAccessToken } from '@/server/db/schema'
import { eq, lt, or, isNull } from 'drizzle-orm'
import { hashSecret, parseOAuthToken, parsePersonalAccessToken } from '@/server/auth/tokens'
import { audienceMatches } from '@/domain/oauth/rules'
import { mcpResource } from '@/server/oauth/metadata'

/**
 * Turns a bearer token into an Actor.
 *
 * The bootstrap problem: reading the token's row needs the tenant, and the
 * tenant comes from that row. Rather than give this path a privileged
 * connection, exactly one narrow SECURITY DEFINER function is allowed to look
 * past RLS -- and it returns nothing but the identifiers needed to set a proper
 * tenant context for everything that follows.
 *
 * After this, the MCP server has no privileged path at all: every tool body
 * runs through the same withTenant as the web app.
 */

/**
 * `patId` is null for an OAuth token: it did not come from the token screen.
 *
 * Both kinds end up here because everything downstream only ever asks two
 * questions -- who is this, and what may it do. The difference between a
 * personal access token and an OAuth grant is how the answer was obtained, and
 * that difference belongs in this file and nowhere else.
 */
export type PatActor = Actor & { patId: string | null; scopes: string[] }

export type McpScope =
  'workshops:read' | 'workshops:write' | 'module_types:read' | 'module_types:write' | 'tenant:read'

export async function resolveBearer(header: string | null): Promise<PatActor | null> {
  const token = /^Bearer\s+(.+)$/i.exec(header ?? '')?.[1]
  if (!token) return null

  const oauth = parseOAuthToken(token)
  // A refresh token presented as a bearer is refused by its prefix, before
  // anything is looked up.
  if (oauth) return oauth.kind === 'access' ? resolveOAuthToken(oauth) : null

  const parsed = parsePersonalAccessToken(token)
  if (!parsed) return null

  const rows = await withoutTenant((tx) =>
    tx.execute(sql`
      select tenant_id, member_id, pat_id, scopes, member_role
      from app.resolve_pat(${parsed.tokenId}, ${hashSecret(parsed.secret)})
    `),
  )

  const row = rows.rows[0] as
    | {
        tenant_id: string
        member_id: string
        pat_id: string
        scopes: string[]
        member_role: string
      }
    | undefined
  if (!row) return null

  void touch(row.tenant_id, row.member_id, row.pat_id)

  return {
    tenantId: row.tenant_id,
    memberId: row.member_id,
    tenantRole: row.member_role === 'admin' ? 'admin' : 'member',
    source: 'mcp',
    patId: row.pat_id,
    scopes: row.scopes,
  }
}

/**
 * Records that the token was used, but not on every call.
 *
 * An LLM client makes a lot of calls, and a write per call would turn a
 * read-only tool into a write-heavy one for the sake of a timestamp nobody
 * reads to the minute.
 */
async function touch(tenantId: string, memberId: string, patId: string): Promise<void> {
  try {
    await withTenant({ tenantId, memberId, tenantRole: 'member', source: 'mcp' }, (tx) =>
      tx
        .update(personalAccessToken)
        .set({ lastUsedAt: sql`now()` })
        .where(
          sql`${personalAccessToken.id} = ${patId} and (${or(
            isNull(personalAccessToken.lastUsedAt),
            lt(personalAccessToken.lastUsedAt, sql`now() - interval '5 minutes'`),
          )})`,
        ),
    )
  } catch {
    // Never let bookkeeping fail a request.
  }
}

/**
 * Effective permission is the intersection of the member's capabilities and the
 * token's scopes.
 *
 * There is deliberately no member-management scope: an MCP client must never be
 * able to invite users or promote admins. That is a decision to hold even when
 * somebody asks for it.
 */
export function hasScope(actor: PatActor, scope: McpScope): boolean {
  return actor.scopes.includes(scope)
}

export class ScopeError extends Error {
  constructor(scope: McpScope) {
    super(
      `Dieses Token hat den Bereich "${scope}" nicht. Lege in den Einstellungen ein Token mit diesem Bereich an.`,
    )
    this.name = 'ScopeError'
  }
}

export function requireScope(actor: PatActor, scope: McpScope): void {
  if (!hasScope(actor, scope)) throw new ScopeError(scope)
}

// Referenced so the eq import stays honest if the query shape changes.
void eq

/**
 * An OAuth access token, checked against the audience it was issued for.
 *
 * The MCP specification is explicit: a server MUST only accept tokens issued
 * for itself. Without that check a token this installation minted for some
 * other resource -- or one a client carried here from elsewhere -- would work,
 * which is the confused-deputy shape the requirement exists to prevent.
 *
 * Resolved through the same SECURITY DEFINER door the PAT path uses: reading
 * the row needs a tenant, and the tenant comes from the row.
 */
async function resolveOAuthToken(parsed: {
  tokenKey: string
  secret: string
}): Promise<PatActor | null> {
  const rows = await withoutTenant((tx) =>
    tx.execute(sql`
      select tenant_id, member_id, scopes, resource, member_role
      from app.resolve_oauth_token(${parsed.tokenKey}, ${hashSecret(parsed.secret)})
    `),
  )

  const row = rows.rows[0] as
    | {
        tenant_id: string
        member_id: string
        scopes: string[]
        resource: string
        member_role: string
      }
    | undefined
  if (!row) return null
  if (!audienceMatches(row.resource, mcpResource())) return null

  return {
    tenantId: row.tenant_id,
    memberId: row.member_id,
    tenantRole: row.member_role === 'admin' ? 'admin' : 'member',
    source: 'mcp',
    patId: null,
    scopes: row.scopes,
  }
}
