import { randomUUID } from 'node:crypto'

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
 * whole. "Unbekannter Modultyp." and a version conflict are answers to the
 * request; flattening them into "something went wrong" would leave a model with
 * no way to decide what to do next, which is how a tool becomes useless.
 */
export type PublicError = { message: string; correlationId: string }

export function publicToolError(error: unknown): PublicError {
  const correlationId = randomUUID().replaceAll('-', '').slice(0, 12)

  if (isExposable(error)) {
    return { message: error.message, correlationId }
  }

  console.error('mcp: tool failed', { correlationId, error })

  return {
    message:
      `Der Aufruf ist fehlgeschlagen. Die Betreiberin findet die Ursache im ` +
      `Serverprotokoll unter der Kennung ${correlationId}.`,
    correlationId,
  }
}

/**
 * Marked deliberately rather than sniffed from the message. A regex over error
 * text is how an internal failure eventually reaches a client because somebody
 * phrased it in German.
 */
function isExposable(error: unknown): error is Error & { expose: true } {
  return error instanceof Error && (error as { expose?: boolean }).expose === true
}
