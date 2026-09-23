'use server'

import { currentOperator } from '@/cloud/operator/session'
import { operatorDb } from '@/cloud/operator/db'
import { createOperatorAuthorizationCode, operatorStore } from '@/cloud/operator/oauth'
import { audienceMatches, redirectUriAllowed } from '@/domain/oauth/rules'
import { operatorProfile } from '@/server/oauth/metadata'
import { isOperatorScope, type OperatorScope } from '@/cloud/operator/scopes'

export type OperatorConsentRequest = {
  clientKey: string
  redirectUri: string
  codeChallenge: string
  state: string | null
  resource: string
  scopes: OperatorScope[]
}

type Outcome = { redirect: string } | { error: string }

/**
 * Everything the page validated is validated AGAIN here.
 *
 * The page's checks decided what to render; these decide what to sign. A form
 * post is a separate request from whoever posts it, and a check that only ran
 * while producing HTML is a check an attacker skips by not asking for the
 * HTML. The scopes are re-narrowed for the same reason: the list arrives from
 * the browser, and a value that is not in the vocabulary must not become one.
 */
async function validated(request: OperatorConsentRequest) {
  const operator = await currentOperator()
  if (!operator) return null

  const profile = operatorProfile()
  const client = await operatorStore(operatorDb()).findClient(request.clientKey)
  if (!client) return null
  if (!redirectUriAllowed(request.redirectUri, client.redirectUris)) return null
  if (!audienceMatches(request.resource, profile.resource)) return null
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(request.codeChallenge)) return null

  const scopes = request.scopes.filter(isOperatorScope)
  if (scopes.length === 0) return null

  return { operator, client, scopes, profile }
}

/** RFC 9207: the client compares this against the issuer it discovered. */
function withParams(base: string, params: Record<string, string | null>, issuer: string): string {
  const url = new URL(base)
  for (const [key, value] of Object.entries(params)) {
    if (value !== null) url.searchParams.set(key, value)
  }
  url.searchParams.set('iss', issuer)
  return url.href
}

export async function approveOperatorAuthorization(
  request: OperatorConsentRequest,
): Promise<Outcome> {
  const ok = await validated(request)
  if (!ok) return { error: 'invalid_request' }

  const code = await createOperatorAuthorizationCode(operatorDb(), {
    clientId: ok.client.id,
    operatorId: ok.operator.id,
    scopes: ok.scopes,
    resource: ok.profile.resource,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
  })

  return {
    redirect: withParams(request.redirectUri, { code, state: request.state }, ok.profile.issuer),
  }
}

export async function denyOperatorAuthorization(request: OperatorConsentRequest): Promise<Outcome> {
  // Validated the same way as an approval: an unvalidated redirect target is
  // an open redirector whether it carries a code or an error.
  const ok = await validated(request)
  if (!ok) return { error: 'invalid_request' }

  return {
    redirect: withParams(
      request.redirectUri,
      { error: 'access_denied', state: request.state },
      ok.profile.issuer,
    ),
  }
}
