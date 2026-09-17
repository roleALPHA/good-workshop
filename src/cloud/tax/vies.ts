/**
 * Checking an EU VAT number against VIES, the European Commission's register.
 *
 * A *qualified* check: when the requester's own VAT number is sent along, VIES
 * returns a consultation number, which is the proof a tax audit asks for that
 * reverse charge was applied to a number that was valid on that day. Without
 * GW_VIES_REQUESTER_VAT_ID the check still says valid or invalid, but proves
 * less.
 *
 * VIES is often slow and member-state backends go down for maintenance, so
 * "could not ask" is an answer of its own and never the same as "invalid".
 */

export type VatCheck =
  | {
      status: 'valid' | 'invalid'
      vatId: string
      name: string | null
      address: string | null
      consultationNumber: string | null
      checkedAt: string
    }
  | { status: 'unavailable'; vatId: string; error: string; checkedAt: string }

const ENDPOINT = 'https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number'
const TIMEOUT_MS = 10_000

type Fetch = typeof fetch

export async function checkVatId(
  vatId: string,
  options: { requesterVatId?: string; fetch?: Fetch; now?: () => Date } = {},
): Promise<VatCheck> {
  const now = options.now ?? (() => new Date())
  const request = options.fetch ?? fetch
  const requester = options.requesterVatId ?? process.env.GW_VIES_REQUESTER_VAT_ID

  const body: Record<string, string> = {
    countryCode: vatId.slice(0, 2),
    vatNumber: vatId.slice(2),
  }
  if (requester) {
    body.requesterMemberStateCode = requester.slice(0, 2)
    body.requesterNumber = requester.slice(2)
  }

  try {
    const response = await request(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    const data = (await response.json().catch(() => null)) as {
      valid?: unknown
      name?: unknown
      address?: unknown
      requestIdentifier?: unknown
      userError?: unknown
      actionSucceed?: unknown
    } | null

    // VIES reports an unreachable member state as a 200 with userError set
    // (MS_UNAVAILABLE, TIMEOUT, SERVICE_UNAVAILABLE ...), not as an HTTP error.
    const userError = typeof data?.userError === 'string' ? data.userError : null
    if (
      !response.ok ||
      !data ||
      typeof data.valid !== 'boolean' ||
      (userError && userError !== 'VALID' && userError !== 'INVALID')
    ) {
      return {
        status: 'unavailable',
        vatId,
        error: userError ?? `HTTP ${response.status}`,
        checkedAt: now().toISOString(),
      }
    }

    // VIES answers "---" where a member state does not disclose a field.
    const field = (value: unknown) =>
      typeof value === 'string' && value.trim() !== '' && value.trim() !== '---'
        ? value.trim()
        : null

    return {
      status: data.valid ? 'valid' : 'invalid',
      vatId,
      name: field(data.name),
      address: field(data.address),
      consultationNumber: field(data.requestIdentifier),
      checkedAt: now().toISOString(),
    }
  } catch (error) {
    return {
      status: 'unavailable',
      vatId,
      error: error instanceof Error ? error.name : 'unknown',
      checkedAt: now().toISOString(),
    }
  }
}
