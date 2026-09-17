/**
 * What GoodWorkshop Cloud costs, in one place.
 *
 * The pricing page, the billing run and the invoice all read these numbers, so
 * the page can never advertise a price the invoice does not charge. Amounts are
 * integer cents: a price that has been through floating point is a price that
 * is off by a cent somewhere.
 */

export type PlanKey = 'per_user' | 'per_workshop'

export type Plan = {
  key: PlanKey
  /** Net price per unit, in euro cents. */
  netCents: number
  /** What one unit is: a member for a month (pro rata by day), or one workshop created. */
  unit: 'user_month' | 'workshop'
}

export const PLANS: Record<PlanKey, Plan> = {
  per_user: { key: 'per_user', netCents: 100, unit: 'user_month' },
  per_workshop: { key: 'per_workshop', netCents: 100, unit: 'workshop' },
}

export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[]

export function isPlanKey(value: unknown): value is PlanKey {
  // Own properties only: `'toString' in PLANS` is true, and a plan called
  // toString is how a form field turns into a crash in the billing run.
  return typeof value === 'string' && Object.hasOwn(PLANS, value)
}

/** Days a new tenant may use the service before it has to pay. */
export const TRIAL_DAYS = 14
