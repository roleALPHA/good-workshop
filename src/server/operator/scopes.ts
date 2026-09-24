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
  /** Writing catalogue content: entries, their agendas, the filter vocabulary -- and deleting one. */
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

/**
 * What a client that names no scope at all receives.
 *
 * Everything except `ops:danger`. The tenant side learned the opposite lesson
 * -- offering too little left Claude and ChatGPT holding write tools they
 * could not run (see OAUTH_SCOPES in src/domain/oauth/rules.ts) -- and this
 * list follows it, with one exception that is the point: blocking a workspace,
 * scheduling its deletion, announcing terms and writing off an invoice must be
 * asked for BY NAME. A permission that can arrive by omission is a permission
 * nobody chose.
 *
 * It is not a second gate. `ops:danger` still only reaches a token through the
 * consent screen, and every action behind it still stages and waits for a
 * confirmation. This is the first of the three, and the cheapest.
 */
export const OPERATOR_OAUTH_SCOPES: readonly OperatorScope[] = OPERATOR_SCOPES.filter(
  (scope) => scope !== 'ops:danger',
)

/**
 * Each scope as a sentence, for the one screen where a person decides.
 *
 * English and hardcoded like the rest of the console, and phrased as what the
 * holder will be ABLE TO DO rather than as the scope's name -- "ops:lifecycle"
 * tells somebody nothing at the moment they are being asked to grant it.
 */
export const OPERATOR_SCOPE_TEXT: Record<OperatorScope, string> = {
  'ops:read': 'See every workspace, its plan, its billing periods and the audit log',
  'ops:lifecycle': 'Pause and unpause workspaces, extend trials, grant grace, open billing periods',
  'ops:danger': 'Block a workspace, schedule its deletion, announce terms, write off an invoice',
  'ops:maintenance': 'Announce and cancel maintenance windows shown to every customer',
  'catalog:author':
    'Write catalogue entries and the filter vocabulary, and delete an entry that is not live',
  'catalog:publish': 'Make catalogue content live, and take it back down',
}
