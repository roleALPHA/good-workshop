import { notFound } from 'next/navigation'
import { currentOperator } from '@/cloud/operator/session'
import { operatorConsoleEnabled, operatorDb } from '@/cloud/operator/db'
import { operatorStore } from '@/cloud/operator/oauth'
import { OPERATOR_SCOPES, type OperatorScope } from '@/cloud/operator/scopes'
import {
  canonicalResource,
  narrowTo,
  redirectUriAllowed,
  wantsRefreshToken,
} from '@/domain/oauth/rules'
import { operatorProfile } from '@/server/oauth/metadata'
import { PasskeyButton } from '../../passkey-button'
import { OperatorConsentForm } from './consent-form'

export const dynamic = 'force-dynamic'

/**
 * The consent screen of the console's authorization server.
 *
 * The one place in the whole flow where a person decides. Everything else --
 * registration, codes, tokens, refresh -- is two machines agreeing with each
 * other, and all of it is shared with the customers' server.
 *
 * A broken request is shown HERE rather than bounced back to the client. The
 * redirect target is the one thing an attacker controls, and sending an error
 * to an address we have not validated is how an open redirector is built.
 */
export default async function OperatorAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  if (!operatorConsoleEnabled()) notFound()

  const params = await searchParams
  const one = (key: string) => {
    const value = params[key]
    return typeof value === 'string' ? value : null
  }

  const profile = operatorProfile()
  const clientKey = one('client_id')
  const redirectUri = one('redirect_uri')
  const challenge = one('code_challenge')

  const client = clientKey ? await operatorStore(operatorDb()).findClient(clientKey) : null

  const problem = (() => {
    if (!client) return 'That client is not registered here.'
    if (!redirectUri || !redirectUriAllowed(redirectUri, client.redirectUris)) {
      return 'That redirect address is not one this client registered.'
    }
    if (one('response_type') !== 'code') return 'Only the authorization code flow is supported.'
    // OAuth 2.1 removed the option of doing without PKCE, and S256 is the only
    // method this server advertises.
    if (!challenge || (one('code_challenge_method') ?? 'S256') !== 'S256') {
      return 'A PKCE challenge using S256 is required.'
    }
    if (canonicalResource(one('resource'), profile.resource) === null) {
      return 'That resource is not this server.'
    }
    return null
  })()

  if (problem) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-semibold tracking-tight">Connect a client</h1>
        <p role="alert" className="mt-2 text-[15px] text-[var(--danger-fg)]">
          {problem}
        </p>
        <p className="mt-2 text-[14px] text-[var(--fg-muted)]">
          Nothing was granted. Whoever sent you here has to fix the request.
        </p>
      </div>
    )
  }

  const scopes = narrowTo<OperatorScope>(
    one('scope'),
    OPERATOR_SCOPES,
    profile.offered as readonly OperatorScope[],
  )

  /**
   * Signed in, as far as this request can tell.
   *
   * An MCP client sends the operator here as a CROSS-SITE navigation, and the
   * console's session cookie is `sameSite=strict`, so it is withheld on that
   * first arrival even when the session is perfectly good. Redirecting to the
   * login page would lose the request; signing in from HERE and coming back to
   * the same address makes the second arrival same-site, with the cookie
   * attached.
   */
  const operator = await currentOperator()
  if (!operator) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-semibold tracking-tight">Sign in to continue</h1>
        <p className="mt-2 text-[15px]">
          <b>{client!.name}</b> is asking to connect. Confirm it is you, and you will come straight
          back to this request.
        </p>
        <div className="mt-4">
          {/* Rebuilt from the values this page already validated, never echoed
              from the query string: the destination is always this page. */}
          <PasskeyButton next={returnPath(clientKey!, redirectUri!, challenge!, params)} />
        </div>
      </div>
    )
  }

  return (
    <OperatorConsentForm
      clientName={client!.name}
      operatorName={operator.displayName}
      scopes={scopes}
      offline={wantsRefreshToken(one('scope'))}
      request={{
        clientKey: clientKey!,
        redirectUri: redirectUri!,
        codeChallenge: challenge!,
        state: one('state'),
        resource: profile.resource,
        scopes,
      }}
    />
  )
}

/** This same page, with the parts of the request that have been checked. */
function returnPath(
  clientKey: string,
  redirectUri: string,
  challenge: string,
  params: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: clientKey,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  for (const key of ['state', 'scope', 'resource']) {
    const value = params[key]
    if (typeof value === 'string') query.set(key, value)
  }
  return `/operator/oauth/authorize?${query.toString()}`
}
