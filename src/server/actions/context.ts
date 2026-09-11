import 'server-only'
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
import { TokenError } from '@/domain/tenant/tokens'
import { TagError } from '@/domain/workshop/tags'
import { FolderMoveError } from '@/domain/workshop/repo'

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
  | { ok: false; error: ActionError; message: string; contentVersion?: string }

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
  if (!actor) return fail('unauthenticated', 'Bitte melde dich an.')

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    return fail('invalid_input', firstIssue(parsed.error))
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

function toResult<T>(error: unknown): ActionResult<T> {
  if (error instanceof NotFoundError) {
    return fail('not_found', 'Nicht gefunden.')
  }
  if (error instanceof ForbiddenError) {
    return fail('forbidden', error.message)
  }
  // Both carry a sentence written for the person reading it. Flattening them
  // into "that did not work" would throw away the only useful part.
  if (
    error instanceof TagError ||
    error instanceof TokenError ||
    error instanceof FolderMoveError
  ) {
    return fail('invalid_input', error.message)
  }
  if (error instanceof VersionConflictError) {
    return {
      ok: false,
      error: 'conflict',
      // Deliberately not "please reload": the client has the current version
      // and can offer a real choice instead of throwing the edit away.
      message: 'Jemand anderes hat diesen Workshop inzwischen geändert.',
      contentVersion: error.actual.toString(),
    }
  }

  console.error('server action failed', error)
  return fail('failed', 'Das hat nicht geklappt. Versuch es noch einmal.')
}

const fail = <T>(error: ActionError, message: string): ActionResult<T> => ({
  ok: false,
  error,
  message,
})

function firstIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  if (!issue) return 'Ungültige Eingabe.'
  return issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message
}
