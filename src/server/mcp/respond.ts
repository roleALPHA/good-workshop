import { VersionConflictError } from '@/domain/agenda/access'
import { ScopeError } from './auth'
import { publicToolError } from './errors'

/**
 * The two shapes a tool answers in, and the one way an error becomes one.
 *
 * Shared by the agenda tools and the library tools, so that "what does a model
 * see when this fails" has a single answer rather than one per file.
 */

export const ok = (text: string, structured?: Record<string, unknown>) => ({
  content: [{ type: 'text' as const, text }],
  ...(structured ? { structuredContent: structured } : {}),
})

export const fail = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  isError: true,
})

/**
 * Errors as instructions.
 *
 * Every domain error -- not-found, forbidden, unknown block type -- is an
 * answer to the request and reaches the caller intact; everything else is an
 * internal failure and gets an id instead of its innards. See publicToolError.
 */
export function toolError(error: unknown) {
  // Written for the caller, and it names what to do: create a token that has
  // the scope. Flattening it into "the call failed" would leave a model
  // retrying something that cannot work.
  if (error instanceof ScopeError) return fail(error.message)

  const { message } = publicToolError(error)

  if (error instanceof VersionConflictError) {
    // The one error that has to say what to do next, or a model retries the
    // same call forever.
    return fail(`${message} Read it again with get_workshop and send the new contentVersion.`)
  }

  return fail(message)
}

/** Runs a tool body and turns whatever it throws into an answer. */
export async function guarded<T>(run: () => Promise<T>): Promise<T | ReturnType<typeof fail>> {
  try {
    return await run()
  } catch (error) {
    return toolError(error)
  }
}
