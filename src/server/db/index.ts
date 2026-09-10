import { sql } from 'drizzle-orm'
import { getDb, type Database } from './client'

export * as schema from './schema'
export type { Actor, TenantContext } from './actor'

import type { Actor } from './actor'

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

/**
 * The only sanctioned way to reach the database.
 *
 * Every request runs in exactly one transaction that sets app.tenant_id first.
 * Three details in here are load-bearing:
 *
 *  - `set_config(name, value, true)` rather than `SET LOCAL app.tenant_id = $1`.
 *    SET takes only literals, no bind parameters, so the obvious form would
 *    require string interpolation in the single most security-critical line of
 *    the codebase. set_config is an ordinary function call and fully
 *    parameterisable.
 *  - The `true` third argument makes it transaction-local. A session-scoped SET
 *    would survive on a pooled connection and hand the next request another
 *    tenant's context -- the one bug in this design that is catastrophic.
 *  - Everything, including a single-row read, goes through here. Drizzle
 *    queries outside a transaction check out an arbitrary pooled connection
 *    with no tenant set, which fails closed (zero rows) but is baffling to
 *    debug.
 */
export async function withTenant<T>(actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${actor.tenantId}, true)`)
    await tx.execute(sql`select set_config('app.member_id', ${actor.memberId}, true)`)
    await tx.execute(
      sql`select set_config('app.is_tenant_admin', ${actor.tenantRole === 'admin' ? 'on' : 'off'}, true)`,
    )
    return fn(tx)
  })
}

/**
 * Tenant context without a member.
 *
 * Needed exactly once: while resolving a session we know the tenant but not
 * yet which member the visitor is -- that is the row we are about to read. The
 * policies only ever compare tenant_id, so an unset member is safe here and
 * nowhere else.
 */
export async function withTenantOnly<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`)
    await tx.execute(sql`select set_config('app.member_id', '', true)`)
    return fn(tx)
  })
}

/**
 * The login path.
 *
 * The global auth tables carry no tenant_id and cannot be protected by tenant
 * RLS, so they are protected by grants instead: gw_app cannot read them at all
 * and must step into gw_auth explicitly. Because gw_app is NOINHERIT, that
 * privilege exists only inside this transaction. Roughly thirty lines of setup
 * buy the guarantee that an ORM mistake in the 95% of the codebase that is not
 * the auth module cannot read credential material.
 */
export async function withAuth<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`set local role gw_auth`)
    return fn(tx)
  })
}

/**
 * Cross-tenant maintenance from the CLI. Uses a BYPASSRLS role and must never
 * be reachable from a request handler.
 */
export async function withOps<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (process.env.GW_ALLOW_OPS !== '1') {
    throw new Error('withOps is CLI-only. Set GW_ALLOW_OPS=1 in the CLI entrypoint.')
  }
  return getDb().transaction(async (tx) => fn(tx))
}

export type { Tx }
