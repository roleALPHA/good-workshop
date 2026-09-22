import type pg from 'pg'

/**
 * What the console reads and changes -- each a call to one app.op_* function,
 * since gw_operator can do nothing else. Every change names the operator, and
 * the function writes the audit entry with it.
 */

type Db = Pick<pg.Pool, 'query'>

export type TenantSummary = {
  id: string
  name: string
  status: 'active' | 'suspended'
  state: 'trial' | 'active' | 'read_only' | 'paused' | 'deleting'
  trialEndsAt: Date | null
  deleteAfter: Date | null
  createdAt: Date
  companyName: string | null
  country: string | null
  vatStatus: string | null
  plan: string | null
  nextPlan: string | null
  paymentMethodReady: boolean
  billingEmail: string | null
  members: number
  workshops: number
  heldPeriods: number
  failedPeriods: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a row of app.op_tenants(), typed by the mapping below
const summary = (row: Record<string, any>): TenantSummary => ({
  id: row.id,
  name: row.name,
  status: row.status,
  state: row.state,
  trialEndsAt: row.trial_ends_at,
  deleteAfter: row.delete_after,
  createdAt: row.created_at,
  companyName: row.company_name,
  country: row.country,
  vatStatus: row.vat_status,
  plan: row.plan,
  nextPlan: row.next_plan,
  paymentMethodReady: Boolean(row.payment_method_ready),
  billingEmail: row.billing_email,
  members: row.members,
  workshops: row.workshops,
  heldPeriods: row.held_periods,
  failedPeriods: row.failed_periods,
})

export async function listTenants(db: Db): Promise<TenantSummary[]> {
  const { rows } = await db.query('select * from app.op_tenants()')
  return rows.map(summary)
}

export async function tenantDetail(db: Db, tenantId: string) {
  const [tenants, periods, audit] = await Promise.all([
    db.query('select * from app.op_tenants($1)', [tenantId]),
    db.query('select * from app.op_periods($1)', [tenantId]),
    db.query('select * from app.op_audit_log($1)', [tenantId]),
  ])
  if (!tenants.rows[0]) return null
  return { tenant: summary(tenants.rows[0]), periods: periods.rows, audit: audit.rows }
}

export type OperatorAction =
  | { kind: 'pause' | 'unpause' | 'block' | 'unblock'; reason: string }
  | { kind: 'extend_trial'; days: number }
  | { kind: 'grant_grace'; days: number; reason: string }
  | { kind: 'schedule_deletion'; days: number; reason: string }
  | { kind: 'cancel_deletion' }
  | { kind: 'release_period'; periodId: string; decision: 'bill' | 'void' }

export async function applyOperatorAction(
  db: Db,
  operatorId: string,
  tenantId: string,
  action: OperatorAction,
): Promise<void> {
  switch (action.kind) {
    case 'pause':
    case 'unpause':
      await db.query('select app.op_set_paused($1, $2, $3, $4)', [
        operatorId,
        tenantId,
        action.kind === 'pause',
        action.reason,
      ])
      return
    case 'block':
    case 'unblock':
      await db.query('select app.op_set_blocked($1, $2, $3, $4)', [
        operatorId,
        tenantId,
        action.kind === 'block',
        action.reason,
      ])
      return
    case 'extend_trial':
      await db.query('select app.op_extend_trial($1, $2, $3)', [operatorId, tenantId, action.days])
      return
    case 'grant_grace':
      await db.query('select app.op_grant_grace($1, $2, $3, $4)', [
        operatorId,
        tenantId,
        action.days,
        action.reason,
      ])
      return
    case 'schedule_deletion':
      await db.query('select app.op_schedule_deletion($1, $2, $3, $4)', [
        operatorId,
        tenantId,
        action.days,
        action.reason,
      ])
      return
    case 'cancel_deletion':
      await db.query('select app.op_cancel_deletion($1, $2)', [operatorId, tenantId])
      return
    case 'release_period':
      await db.query('select app.op_release_period($1, $2, $3)', [
        operatorId,
        action.periodId,
        action.decision,
      ])
      return
  }
}
