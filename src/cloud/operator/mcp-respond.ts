import { publicToolError } from '@/server/mcp/errors'
import { fail } from '@/server/mcp/respond'
import { OperatorScopeError } from './scopes'

/**
 * How an operator tool answers when it throws.
 *
 * Separate from `guarded` next door, and not for want of sharing. That one
 * passes a tenant `ScopeError` through and translates domain errors through
 * the message catalogues; there are no domain errors here, and an
 * `OperatorScopeError` is exactly the thing a model has to be told or it
 * retries a call that cannot work. Everything else still gets a correlation id
 * and nothing more -- this endpoint sees every workspace, and a Postgres error
 * message would name tables and constraints to whoever holds the token.
 */
export async function opGuarded<T>(run: () => Promise<T>): Promise<T | ReturnType<typeof fail>> {
  try {
    return await run()
  } catch (error) {
    // Names the fix: issue a token that has the scope.
    if (error instanceof OperatorScopeError) return fail(error.message)
    return fail(publicToolError(error).message)
  }
}
