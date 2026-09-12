'use server'

import { withTenant } from '@/server/db'
import { currentActor } from '@/server/actions/context'
import { createAuthorizationCode, findClient } from '@/domain/oauth/repo'
import { audienceMatches, redirectUriAllowed } from '@/domain/oauth/rules'
import { issuer, mcpResource } from '@/server/oauth/metadata'
import type { Scope } from '@/domain/tenant/tokens'

export type ConsentRequest = {
  clientKey: string
  redirectUri: string
  codeChallenge: string
  state: string | null
  resource: string
  scopes: Scope[]
}

type Outcome = { redirect: string } | { error: string }

/**
 * Everything the page validated is validated AGAIN here.
 *
 * The page's checks decided what to render; these decide what to sign. A form
 * post is a separate request from whoever posts it, and a check that only ran
 * while producing HTML is a check an attacker skips by not asking for the HTML.
 */
async function validated(request: ConsentRequest) {
  const actor = await currentActor()
  if (!actor?.memberId) return null

  return withTenant(actor, async (tx) => {
    const client = await findClient(tx, request.clientKey)
    if (!client) return null
    if (!redirectUriAllowed(request.redirectUri, client.redirectUris)) return null
    if (!audienceMatches(request.resource, mcpResource())) return null
    if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(request.codeChallenge)) return null
    return { actor, client, tx }
  })
}

/** RFC 9207: the client compares this against the issuer it discovered. */
function withParams(base: string, params: Record<string, string | null>): string {
  const url = new URL(base)
  for (const [key, value] of Object.entries(params)) {
    if (value !== null) url.searchParams.set(key, value)
  }
  url.searchParams.set('iss', issuer())
  return url.href
}

export async function approveAuthorization(request: ConsentRequest): Promise<Outcome> {
  const actor = await currentActor()
  if (!actor?.memberId) return { error: 'unauthenticated' }

  const code = await withTenant(actor, async (tx) => {
    const client = await findClient(tx, request.clientKey)
    if (!client) return null
    if (!redirectUriAllowed(request.redirectUri, client.redirectUris)) return null
    if (!audienceMatches(request.resource, mcpResource())) return null
    if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(request.codeChallenge)) return null

    return createAuthorizationCode(tx, {
      clientId: client.id,
      memberId: actor.memberId!,
      scopes: request.scopes,
      resource: mcpResource(),
      redirectUri: request.redirectUri,
      codeChallenge: request.codeChallenge,
    })
  })

  if (!code) return { error: 'invalid_request' }
  return { redirect: withParams(request.redirectUri, { code, state: request.state }) }
}

export async function denyAuthorization(request: ConsentRequest): Promise<Outcome> {
  // Validated the same way as an approval: an unvalidated redirect target is an
  // open redirector whether it carries a code or an error.
  const ok = await validated(request)
  if (!ok) return { error: 'invalid_request' }

  return {
    redirect: withParams(request.redirectUri, {
      error: 'access_denied',
      state: request.state,
    }),
  }
}
