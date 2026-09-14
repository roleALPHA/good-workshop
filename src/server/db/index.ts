import { sql } from 'drizzle-orm'
import { createListenClient, getDb, type Database } from './client'

export * as schema from './schema'
export type { Actor, TenantContext } from './actor'
export { memberIdOf } from './actor'

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
    // '' rather than the value for a guest, who has no member: app.current_member()
    // maps the empty string to NULL (drizzle/sql/000_bootstrap.sql), which is the
    // honest answer and the one a policy written against it would want.
    await tx.execute(sql`select set_config('app.member_id', ${actor.memberId ?? ''}, true)`)
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
 * A transaction with no tenant context at all.
 *
 * Exists for exactly one caller: resolving a personal access token, where the
 * tenant is what we are trying to find out. Everything reachable this way must
 * go through app.resolve_pat, which is SECURITY DEFINER and returns nothing but
 * the identifiers needed to set a proper context afterwards.
 *
 * Anything else called from here would run with no tenant, which fails closed
 * (zero rows) rather than leaking -- but it would still be a bug.
 */
export async function withoutTenant<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => fn(tx))
}

/**
 * Calls `onNotify` for every NOTIFY on `channel`, for as long as it is open.
 *
 * Carries no data into a tenant context: a notification here is a nudge to go
 * and ask again through withTenant, never an answer in itself. That is also why
 * a lost connection is not an error -- it reconnects, and then calls
 * `onReconnect`, because whatever was notified while it was away is gone and
 * the caller has to assume it missed something.
 */
export function listen(
  channel: string,
  onNotify: () => void,
  onReconnect: () => void,
): { close: () => Promise<void> } {
  let client: ReturnType<typeof createListenClient> | null = null
  let closed = false
  let retry: NodeJS.Timeout | null = null
  let connectedOnce = false

  const connect = async () => {
    if (closed) return

    let next: ReturnType<typeof createListenClient>
    try {
      next = createListenClient()
    } catch (error) {
      // No DATABASE_URL, or an unreadable password file. Thrown from here it
      // would be an unhandled rejection -- `connect` is fired and forgotten --
      // and Node ends the process on one. A container starts before its
      // database and has to wait for it, like the lazy pool does.
      console.warn('db: listen not possible yet, retrying', { channel, error })
      retry = setTimeout(() => void connect(), 5_000)
      retry.unref()
      return
    }
    client = next
    next.on('notification', (message) => {
      if (message.channel === channel) onNotify()
    })
    next.on('error', () => void next.end().catch(() => {}))
    next.on('end', () => {
      if (closed || client !== next) return
      client = null
      retry = setTimeout(() => void connect(), 1_000)
    })

    try {
      await next.connect()
      await next.query(`listen ${next.escapeIdentifier(channel)}`)
      if (connectedOnce) onReconnect()
      connectedOnce = true
    } catch (error) {
      console.warn('db: listen failed, retrying', { channel, error })
      await next.end().catch(() => {})
    }
  }

  void connect()

  return {
    close: async () => {
      closed = true
      if (retry) clearTimeout(retry)
      await client?.end().catch(() => {})
    },
  }
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
