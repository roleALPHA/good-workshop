/**
 * Domain errors carry a key, not a sentence.
 *
 * WHY. The same error reaches three audiences that do not share a language:
 * the person in the browser, whose language is their own; an MCP client, whose
 * audience is a model and is always addressed in English; and a log, which
 * belongs to an operator. A German sentence thrown from src/domain forces all
 * three to be German, and putting `getTranslations()` down here would make the
 * domain layer depend on a request -- which it must not, because the
 * collaboration server and the MCP route both run outside one.
 *
 * So: the key travels, and exactly two places turn it into a sentence.
 * src/server/actions/context.ts for the web, src/server/mcp/errors.ts for MCP.
 *
 * `Error.message` is the key itself rather than a rendered string, so anything
 * that logs an error -- or forgets to translate it -- prints something
 * unambiguous instead of half a translation in the wrong language.
 */

export const DOMAIN_ERROR_KEYS = [
  // Workshop access and concurrency
  'workshop.notFound',
  'workshop.forbidden',
  'workshop.versionConflict',
  'workshop.unknownModuleType',
  'workshop.unknownModuleTypeOptions',
  'workshop.descInvalid',
  // Tags
  'tags.tooMany',
  'tags.tooLong',
  'tags.createFailed',
  // Personal access tokens
  'token.nameRequired',
  'token.nameTooLong',
  'token.unknownScopes',
  'token.noScopes',
  'token.gone',
  // Tenant logo
  'logo.unsupportedType',
  'logo.empty',
  'logo.tooLarge',
  'logo.notSvg',
  // Three keys rather than one with a reason parameter: each refusal needs a
  // different sentence about what to do next, and the construct that tripped it
  // (`<script>`, `on…=`) is markup, which reads the same in every language.
  'logo.unsafeActive',
  'logo.unsafeExternal',
  'logo.unsafeDoctype',
  'logo.typeMismatch',
  // Members
  'member.adminOnly',
  'member.invalidEmail',
  'member.gone',
  'member.cannotDisableSelf',
  'member.lastAdmin',
  // Branding
  'brand.notHex',
  'brand.grey',
  'brand.contrastOnBrand',
  'brand.contrastSubtle',
  // Per-workshop sharing
  'sharing.memberGone',
  'sharing.memberDisabled',
  'sharing.ownerHasAccess',
  // Live collaboration
  'collab.unavailable',
  // First-run setup
  'setup.wrongKey',
  'setup.invalidEmail',
  'setup.alreadyClaimed',
  'setup.identityFailed',
] as const

export type DomainErrorKey = (typeof DOMAIN_ERROR_KEYS)[number]

/** Values that survive JSON and the RSC boundary. No bigint, no Date. */
export type DomainErrorParams = Record<string, string | number>

export class DomainError extends Error {
  /**
   * What src/server/mcp/errors.ts looks for before it will show an error to a
   * client rather than flattening it into "the call failed".
   *
   * Set on the base class deliberately: it used to be checked there and set
   * nowhere at all, so every domain error was flattened and the doc comment
   * describing the distinction was describing something that did not happen.
   */
  readonly expose = true

  constructor(
    readonly messageKey: DomainErrorKey,
    readonly params: DomainErrorParams = {},
  ) {
    super(messageKey)
    this.name = new.target.name
  }
}
