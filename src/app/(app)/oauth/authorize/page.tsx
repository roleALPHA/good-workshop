import { getTranslations } from 'next-intl/server'
import { withTenant } from '@/server/db'
import { readSessionCached } from '@/server/auth/session'
import { findClient } from '@/domain/oauth/repo'
import {
  canonicalResource,
  narrowScopes,
  redirectUriAllowed,
  wantsRefreshToken,
} from '@/domain/oauth/rules'
import { mcpResource } from '@/server/oauth/metadata'
import { ConsentForm } from './consent-form'

export const dynamic = 'force-dynamic'

/**
 * The consent screen: the one place in the whole flow where a person decides.
 *
 * Everything else -- registration, codes, tokens, refresh -- is two machines
 * agreeing with each other. This is where somebody looks at a name they may
 * not recognise and says yes or no, so it says plainly WHICH client, on WHOSE
 * behalf, and exactly what it will be able to do.
 *
 * A broken request is shown HERE rather than bounced back to the client. The
 * redirect target is the one thing an attacker controls, and sending an error
 * to an address we have not validated is how an open redirector is built.
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const one = (key: string) => {
    const value = params[key]
    return typeof value === 'string' ? value : null
  }

  const [session, t] = await Promise.all([readSessionCached(), getTranslations('oauth')])
  // The layout above already sent anybody without a session to sign in.
  if (!session) return null

  const clientKey = one('client_id')
  const redirectUri = one('redirect_uri')
  const challenge = one('code_challenge')

  const client = clientKey
    ? await withTenant(
        {
          tenantId: session.tenantId,
          memberId: session.memberId,
          tenantRole: session.tenantRole,
          source: 'web',
        },
        (tx) => findClient(tx, clientKey),
      )
    : null

  const problem = (() => {
    if (!client) return t('unknownClient')
    if (!redirectUri || !redirectUriAllowed(redirectUri, client.redirectUris)) {
      return t('badRedirect')
    }
    if (one('response_type') !== 'code') return t('badResponseType')
    // OAuth 2.1 removed the option of doing without PKCE, and S256 is the only
    // method this server advertises.
    if (!challenge || (one('code_challenge_method') ?? 'S256') !== 'S256') return t('badChallenge')
    if (canonicalResource(one('resource'), mcpResource()) === null) return t('badResource')
    return null
  })()

  if (problem) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
        <p role="alert" className="mt-2 text-[15px] text-[var(--danger-fg)]">
          {problem}
        </p>
        <p className="mt-2 text-[14px] text-[var(--fg-muted)]">{t('problemHint')}</p>
      </div>
    )
  }

  const scopes = narrowScopes(one('scope'))

  return (
    <ConsentForm
      clientName={client!.name}
      email={session.email ?? ''}
      scopes={scopes}
      offline={wantsRefreshToken(one('scope'))}
      request={{
        clientKey: clientKey!,
        redirectUri: redirectUri!,
        codeChallenge: challenge!,
        state: one('state'),
        resource: mcpResource(),
        scopes,
      }}
    />
  )
}
