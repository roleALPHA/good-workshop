import { readFileSync } from 'node:fs'

/**
 * Opening a ticket in the helpdesk, for the support form in the app.
 *
 * Zammad, over its REST API, with an agent's access token. The person writing
 * becomes the ticket's customer by e-mail address (`guess:` creates them on
 * first contact), so the helpdesk answers them by mail like any other ticket
 * and nothing about the conversation lives in this database.
 *
 * Plain fetch rather than a client library, for the same reason as the mail
 * transport in src/server/auth/mail.ts: one call, and a dependency would be
 * more code to audit than the call itself.
 *
 * A helpdesk that is down or refuses is an answer, never an exception -- the
 * form has to tell the person to write an e-mail instead, and an exception
 * would turn that into "something went wrong".
 */

export type ZammadConfig = {
  /** Where the helpdesk is served, without /api/v1. */
  url: string
  /** An access token of an agent with ticket.agent in the group. */
  token: string
  /** The group tickets land in -- one helpdesk serves more than one product. */
  group: string
}

export type SupportTicket = {
  subject: string
  body: string
  customerEmail: string
}

export type TicketResult =
  { status: 'created'; id: number; number: string } | { status: 'unavailable'; error: string }

const TIMEOUT_MS = 10_000
/** Enough to see what the helpdesk objected to; not a log line that grows with its HTML. */
const MAX_ERROR = 500

type Fetch = typeof fetch

/**
 * The helpdesk this installation sends to, or null for one that has none.
 *
 * Read per call, like the SMTP settings: the token file is a mounted secret,
 * and a rotated token should not need a restart. The file wins over the plain
 * value, which is the convention for every secret here.
 */
export function zammadConfig(
  env: Record<string, string | undefined> = process.env,
): ZammadConfig | null {
  // Spelled as strings: scripts/check-docs.mjs finds a variable by its name,
  // and through an injected `env` there is no `process.env.` in front of it.
  const url = env['GW_ZAMMAD_URL']
  const group = env['GW_ZAMMAD_GROUP']
  const tokenFile = env['GW_ZAMMAD_TOKEN_FILE']
  const token = tokenFile ? readFileSync(tokenFile, 'utf8').trim() : env['GW_ZAMMAD_TOKEN']
  if (!url || !group || !token) return null
  return { url, group, token }
}

export async function createTicket(
  config: ZammadConfig,
  ticket: SupportTicket,
  options: { fetch?: Fetch } = {},
): Promise<TicketResult> {
  const request = options.fetch ?? fetch
  const endpoint = new URL(
    'api/v1/tickets',
    config.url.endsWith('/') ? config.url : `${config.url}/`,
  )

  try {
    const response = await request(endpoint.toString(), {
      method: 'POST',
      headers: {
        authorization: `Token token=${config.token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        title: ticket.subject,
        group: config.group,
        customer_id: `guess:${ticket.customerEmail}`,
        article: {
          subject: ticket.subject,
          body: ticket.body,
          type: 'web',
          sender: 'Customer',
          content_type: 'text/plain',
          internal: false,
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const text = await response.text()
    const data = parse(text)
    if (response.ok && typeof data?.id === 'number' && data.number != null) {
      return { status: 'created', id: data.id, number: String(data.number) }
    }
    return { status: 'unavailable', error: describe(response.status, text, config.token) }
  } catch (error) {
    // The name only: a timeout is a DOMException, which is not an Error in
    // every runtime, and a message could carry the address with its query.
    const name = (error as { name?: unknown } | null)?.name
    return { status: 'unavailable', error: typeof name === 'string' ? name : 'unknown' }
  }
}

function parse(text: string): { id?: unknown; number?: unknown } | null {
  try {
    return JSON.parse(text) as { id?: unknown; number?: unknown }
  } catch {
    return null
  }
}

/**
 * What the helpdesk answered, for the log. Only the response, never the
 * request -- and the token cut out even from that, because an error page that
 * echoes the Authorization header is exactly the kind of thing that ends up in
 * a log nobody meant to be secret.
 */
function describe(status: number, text: string, token: string): string {
  const body = text.split(token).join('[token]').slice(0, MAX_ERROR)
  return `HTTP ${status}: ${body}`
}
