/**
 * What an operator token may do.
 *
 * DELIBERATELY NOT part of `SCOPES` in src/domain/tenant/tokens.ts. That list
 * is rendered as checkboxes on the customer's own token screen, and an
 * `ops:danger` appearing there is a bug waiting for a screenshot. Two
 * vocabularies, two audiences, no overlap.
 *
 * English and hardcoded, like the rest of the console: it has one reader.
 * `src/i18n/catalogs.test.ts` iterates SCOPES and not this list, so there is
 * no catalogue work behind adding one here.
 */
export const OPERATOR_SCOPES = [
  /** Every read: tenants, billing periods, the audit log, maintenance, the catalogue. */
  'ops:read',
  /** Reversible changes to a tenant's life: pause, unpause, unblock, trials, grace, periods. */
  'ops:lifecycle',
  /** Blocking, scheduling deletion, announcing terms, writing off an invoice. Confirmed. */
  'ops:danger',
  /** Announcing and cancelling maintenance windows. */
  'ops:maintenance',
  /** Writing catalogue content: methods, designs, the filter vocabulary. */
  'catalog:author',
  /**
   * Making catalogue content live.
   *
   * Separate from authoring on purpose: a token handed to a model for bulk
   * import should be able to fill the catalogue and unable to publish any of
   * it.
   */
  'catalog:publish',
] as const

export type OperatorScope = (typeof OPERATOR_SCOPES)[number]

export function isOperatorScope(value: unknown): value is OperatorScope {
  return typeof value === 'string' && (OPERATOR_SCOPES as readonly string[]).includes(value)
}

export class OperatorScopeError extends Error {
  constructor(scope: OperatorScope) {
    super(`This token does not have the "${scope}" scope. Issue one that does in the console.`)
    this.name = 'OperatorScopeError'
  }
}

export function requireOperatorScope(scopes: OperatorScope[], scope: OperatorScope): void {
  if (!scopes.includes(scope)) throw new OperatorScopeError(scope)
}
