import { sql } from 'drizzle-orm'
import { customType, timestamp, uuid } from 'drizzle-orm/pg-core'

/** Raw bytes. Yjs updates are binary and must not go through a text encoding. */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
})

/** Case-insensitive text. Used for e-mail and for names that must be unique regardless of case. */
export const citext = customType<{ data: string }>({
  dataType: () => 'citext',
})

/**
 * The tenant column, with its default.
 *
 * `default app.current_tenant()` removes tenant_id from every INSERT in the
 * codebase and eliminates the whole class of "forgot to set tenant_id" bugs.
 * Combined with the WITH CHECK half of the policy, a forgotten tenant is
 * impossible rather than merely unlikely.
 */
export const tenantId = () =>
  uuid('tenant_id')
    .notNull()
    .default(sql`app.current_tenant()`)

export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}

/**
 * The one policy every tenant-scoped table gets, verbatim.
 *
 * `(select app.current_tenant())` rather than a bare call: wrapping it in a
 * scalar subquery lets the planner hoist it into an InitPlan evaluated once per
 * query instead of once per row. On a large scan that is the difference between
 * a good plan and a bad one.
 */
export const TENANT_POLICY_USING = sql`tenant_id = (select app.current_tenant())`
