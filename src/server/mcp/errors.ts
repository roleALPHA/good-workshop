import { randomUUID } from 'node:crypto'
import { DomainError } from '@/domain/errors'
import { ModuleDescError } from '@/domain/moduleType/validate'
import { translator } from '@/i18n/translator'

/**
 * What an MCP client is told when something breaks.
 *
 * `fail(error.message)` handed the raw text through. Postgres names its
 * constraints, columns and tables in its messages, and the collaboration client
 * names the internal host and port it could not reach. A token holder is not
 * the public, so this was never severe -- but a personal access token is a
 * credential a person hands to a third-party LLM client, and a schema dump is a
 * schema dump.
 *
 * The operator still needs the real text, so it goes to the log with an id and
 * the id goes to the client. The two can then be put back together by somebody
 * entitled to do it.
 *
 * Errors written FOR the caller are not internal failures and pass through
 * whole. "There is no such block type" and a version conflict are answers to
 * the request; flattening them into "something went wrong" would leave a model
 * with no way to decide what to do next, which is how a tool becomes useless.
 *
 * ENGLISH, ALWAYS. This is the one surface whose audience is a model rather
 * than a person: the text is prompt material, and the model decides its next
 * call from it. See src/server/mcp/tools.ts for the same decision about tool
 * descriptions. What a human reads -- the Markdown a facilitator will paste
 * into a document -- takes an explicit locale instead.
 */
export type PublicError = { message: string; correlationId: string }

export function publicToolError(error: unknown): PublicError {
  const correlationId = randomUUID().replaceAll('-', '').slice(0, 12)

  if (error instanceof DomainError) {
    const t = translator('en', 'errors')

    if (error instanceof ModuleDescError) {
      const issues = error.issues
        .map((issue) => `${issue.path} ${t(`field.${issue.messageKey}`, issue.params)}`.trim())
        .join('; ')
      return { message: t('domain.workshop.descInvalid', { issues }), correlationId }
    }

    return {
      message: t(`domain.${error.messageKey}`, error.params),
      correlationId,
    }
  }

  console.error('mcp: tool failed', { correlationId, error })

  return {
    message:
      `The call failed. The operator can find the cause in the server log ` +
      `under the reference ${correlationId}.`,
    correlationId,
  }
}
