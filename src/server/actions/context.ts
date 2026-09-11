import 'server-only'
import { getTranslations } from 'next-intl/server'
import type { z } from 'zod'
import type { Actor, Tx } from '@/server/db'
import { withTenant } from '@/server/db'
import { readSession } from '@/server/auth/session'
import {
  ForbiddenError,
  NotFoundError,
  VersionConflictError,
  assertWorkshopAccess,
  type Capability,
  type WorkshopAccess,
} from '@/domain/agenda/access'
import { DomainError } from '@/domain/errors'
import { ModuleDescError } from '@/domain/moduleType/validate'
import type { Translate } from '@/i18n/translator'

/**
 * The one way a server action reaches the database.
 *
 * Three things happen here and nowhere else: the session becomes an Actor, the
 * input is parsed, and the whole thing runs inside a tenant-scoped transaction.
 * Spreading any of those across call sites is how one endpoint eventually ships
 * without a tenant context or without a permission check.
 *
 * Errors come back as values rather than exceptions. A server action's result
 * crosses to the client, and an unhandled throw there becomes an opaque
 * "something went wrong" digest -- useless to the person who just lost their
 * edit, and useless in a bug report.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false
      /** The coarse category, unchanged: what a caller branches on. */
      error: ActionError
      /** The catalog key, for a client that wants to render this its own way. */
      messageKey: string
      /** Primitives only -- this crosses the RSC boundary. */
      params?: Record<string, string | number>
      /** The same key, already rendered in the requesting person's language. */
      message: string
      contentVersion?: string
    }

export type ActionError =
  'unauthenticated' | 'not_found' | 'forbidden' | 'conflict' | 'invalid_input' | 'failed'

export async function currentActor(): Promise<Actor | null> {
  const session = await readSession()
  if (!session) return null
  return {
    tenantId: session.tenantId,
    memberId: session.memberId,
    tenantRole: session.tenantRole,
    source: 'web',
  }
}

/** Runs `fn` for the signed-in member inside one tenant-scoped transaction. */
export async function action<Input, Output>(
  schema: z.ZodType<Input>,
  raw: unknown,
  fn: (tx: Tx, actor: Actor, input: Input) => Promise<Output>,
): Promise<ActionResult<Output>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const issue = firstIssue(parsed.error)
    return fail('invalid_input', issue.key, issue.params)
  }

  try {
    return { ok: true, data: await withTenant(actor, (tx) => fn(tx, actor, parsed.data)) }
  } catch (error) {
    return toResult(error)
  }
}

/**
 * The same, for anything scoped to one workshop: resolves and asserts access
 * before `fn` runs, so the capability token exists by construction.
 */
export async function workshopAction<Input extends { workshopId: string }, Output>(
  schema: z.ZodType<Input>,
  raw: unknown,
  capability: Capability,
  fn: (tx: Tx, access: WorkshopAccess, input: Input) => Promise<Output>,
  options: { includeTrashed?: boolean } = {},
): Promise<ActionResult<Output>> {
  return action(schema, raw, async (tx, actor, input) => {
    const access = await assertWorkshopAccess(tx, actor, input.workshopId, capability, options)
    return fn(tx, access, input)
  })
}

/**
 * One of the two places a message key becomes a sentence.
 *
 * The other is src/server/mcp/errors.ts, which renders the same keys in
 * English because its audience is a model. Neither lives in src/domain -- that
 * layer also serves the collaboration server, which runs outside a request and
 * has no language to render in. See src/domain/errors.ts.
 */
export async function toResult<T>(error: unknown): Promise<ActionResult<T>> {
  // Before the general case: the field errors have keys of their own, and this
  // is the layer that knows which language to render them in.
  if (error instanceof ModuleDescError) {
    // The loose signature, because the key is chosen at runtime from
    // FieldErrorKey and next-intl's typed one wants the union of every
    // message's arguments at once. What checks these keys exist -- in all four
    // languages, which no type can -- is src/i18n/catalogs.test.ts.
    const t = (await getTranslations('errors')) as unknown as Translate
    const issues = error.issues
      .map((issue) => `${issue.path} ${t(`field.${issue.messageKey}`, issue.params)}`.trim())
      .join('; ')
    return fail('invalid_input', 'domain.workshop.descInvalid', { issues })
  }

  if (error instanceof DomainError) {
    const result = await fail<T>(categoryOf(error), `domain.${error.messageKey}`, error.params)
    if (result.ok || !(error instanceof VersionConflictError)) return result
    // Deliberately not "please reload": the client has the current version and
    // can offer a real choice instead of throwing the edit away.
    return { ...result, contentVersion: error.actual.toString() }
  }

  console.error('server action failed', error)
  return fail('failed', 'failed')
}

/** Which of the six coarse categories a domain error belongs to. */
function categoryOf(error: DomainError): ActionError {
  if (error instanceof NotFoundError) return 'not_found'
  if (error instanceof ForbiddenError) return 'forbidden'
  if (error instanceof VersionConflictError) return 'conflict'
  // Everything else is something the person can correct in the form they are
  // looking at -- a name too long, a colour with no hue, a scope that does not
  // exist.
  return error.messageKey === 'member.adminOnly' ? 'forbidden' : 'invalid_input'
}

export async function fail<T>(
  error: ActionError,
  messageKey: string,
  params: Record<string, string | number> = {},
): Promise<ActionResult<T>> {
  const t = (await getTranslations('errors')) as unknown as Translate
  return {
    ok: false,
    error,
    messageKey: `errors.${messageKey}`,
    ...(Object.keys(params).length > 0 ? { params } : {}),
    message: t(messageKey, params),
  }
}

/**
 * Zod's own messages are English, and two schemas in this tree override them
 * with German ones. Surfacing either would put the wrong language in front of
 * somebody in the third. The field path is the part that is worth showing and
 * is language-neutral; the rest is "check this input", which the catalog says
 * in four languages.
 */
function firstIssue(error: z.ZodError): { key: string; params?: Record<string, string> } {
  const path = error.issues[0]?.path ?? []
  return path.length > 0
    ? { key: 'invalidField', params: { field: path.join('.') } }
    : { key: 'invalid_input' }
}

/**
 * A failure whose text is NOT a catalog key.
 *
 * There is exactly one legitimate reason to reach for this: relaying a message
 * that came from somewhere else and is the entire point of the screen -- an
 * SMTP relay answering "535 authentication failed", say. Translating that
 * would mean inventing a sentence the relay did not say.
 *
 * Anything the application itself has to say belongs in the catalog. If you are
 * about to pass a German string literal here, use `fail` instead.
 */
export function failRelayed<T>(error: ActionError, text: string): ActionResult<T> {
  // The key is the generic failure, so a client that chooses to render from the
  // key rather than from `message` still gets a sentence in its own language
  // instead of a missing-message error.
  return { ok: false, error, messageKey: 'errors.failed', message: text }
}
