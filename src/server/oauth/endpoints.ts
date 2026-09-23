import { NextResponse, type NextRequest } from 'next/server'
import { rateLimiter } from '@/server/auth/ratelimit'
import { clientAddress } from '@/server/auth/client-address'
import { verifySecret } from '@/server/auth/tokens'
import { audienceMatches, verifyCodeChallenge } from '@/domain/oauth/rules'
import { OAuthError, type OAuthStore } from '@/domain/oauth/store'

/**
 * The three machine-to-machine endpoints of OAuth 2.1, once.
 *
 * Registration, token and revocation are pure protocol: nothing in them
 * depends on whether the subject is a member of a workspace or the operator of
 * the installation. What differs is where the rows live, and that arrives as
 * an `OAuthStore`. The consent screen is deliberately NOT here -- it is the one
 * place a person decides, and the two audiences need different words, different
 * sessions and different scope descriptions.
 *
 * Errors are uniform on purpose -- `invalid_grant` for every way a code or a
 * refresh token can fail. Telling a caller WHICH part was wrong (unknown /
 * expired / already spent / belongs to another client) is telling an attacker
 * which half of their guess was right.
 */

/** Reads a form field, or null. Repeated at every call site otherwise. */
export type Field = (key: string) => string | null

/**
 * Runs `use` with a store, or answers null when no store applies.
 *
 * A function rather than a store, because the customers' side cannot open one
 * until it knows which tenant the grant belongs to -- that is read off the code
 * or the refresh token, since the client is not authenticated yet and no
 * session is involved -- and then has to hold a transaction open around the
 * whole exchange. The console's side has neither concern and simply calls
 * through.
 */
export type WithStore = <T>(use: (store: OAuthStore) => Promise<T>) => Promise<T>

/** Which endpoint is asking. The customers' side answers differently for each. */
export type Purpose = 'register' | 'token' | 'revoke'

export type OpenStore = (purpose: Purpose, field: Field) => Promise<WithStore | null>

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

const fieldsOf =
  (form: FormData): Field =>
  (key) => {
    const value = form.get(key)
    return typeof value === 'string' ? value : null
  }

const NO_FIELDS: Field = () => null

/**
 * RFC 7591 Dynamic Client Registration, open by design.
 *
 * The MCP specification expects a client the server has never heard of to be
 * able to start the flow, so there is no credential in front of this. What
 * keeps it from being a hole is that a registration grants NOTHING: it is a
 * name and a redirect target, and every permission still comes from a person at
 * the consent screen. A registration nobody consents to is a row that does
 * nothing, forever.
 *
 * What open registration IS, is a place to write rows -- so it is rate limited
 * per address, which is the only defence that makes sense for an endpoint that
 * must stay reachable by strangers. Each endpoint built here gets its OWN
 * limiter: a flood against one authorization server must not lock callers out
 * of the other.
 */
export function registrationEndpoint(open: OpenStore) {
  const registrations = rateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 })

  return async function POST(request: NextRequest) {
    if (!registrations.take(clientAddress(request.headers))) {
      return NextResponse.json({ error: 'too_many_requests' }, { status: 429 })
    }

    const body = (await request.json().catch(() => null)) as {
      client_name?: unknown
      redirect_uris?: unknown
      token_endpoint_auth_method?: unknown
    } | null

    const redirectUris = Array.isArray(body?.redirect_uris)
      ? (body.redirect_uris as unknown[])
      : null
    if (!body || !redirectUris) {
      return NextResponse.json(
        { error: 'invalid_client_metadata', error_description: 'redirect_uris is required' },
        { status: 400 },
      )
    }

    const withStore = await open('register', NO_FIELDS)
    if (!withStore) return NextResponse.json({ error: 'server_error' }, { status: 500 })

    try {
      const client = await withStore((store) =>
        store.registerClient({
          name: typeof body.client_name === 'string' ? body.client_name : 'MCP client',
          redirectUris: redirectUris.filter((u): u is string => typeof u === 'string'),
          confidential: body.token_endpoint_auth_method === 'client_secret_post',
        }),
      )

      return NextResponse.json(
        {
          client_id: client.clientKey,
          ...(client.secret ? { client_secret: client.secret } : {}),
          client_name: client.name,
          redirect_uris: client.redirectUris,
          grant_types: ['authorization_code', 'refresh_token'],
          response_types: ['code'],
          token_endpoint_auth_method: client.secret ? 'client_secret_post' : 'none',
        },
        { status: 201 },
      )
    } catch (error) {
      if (error instanceof OAuthError) {
        return NextResponse.json(
          { error: 'invalid_redirect_uri', error_description: error.message },
          { status: 400 },
        )
      }
      return NextResponse.json({ error: 'server_error' }, { status: 500 })
    }
  }
}

/** The token endpoint: two grants, and the checks that make each one safe. */
export function tokenEndpoint(open: OpenStore) {
  const attempts = rateLimiter({ limit: 60, windowMs: 60_000 })

  return async function POST(request: NextRequest) {
    if (!attempts.take(clientAddress(request.headers))) return bad('slow_down', 429)

    const form = await request.formData().catch(() => null)
    if (!form) return bad('invalid_request')
    const get = fieldsOf(form)

    const grantType = get('grant_type')
    const clientKey = get('client_id')
    if (!clientKey) return bad('invalid_client', 401)

    const withStore = await open('token', get)
    // Nothing that names a store: a code or refresh token belonging nowhere.
    // The same answer an unknown one gets.
    if (!withStore) return bad('invalid_grant')

    return withStore(async (store) => {
      const client = await store.findClient(clientKey)
      if (!client) return bad('invalid_client', 401)

      // A confidential client registered a secret, so it has to present it. A
      // public one has none, and demanding one would lock out every CLI.
      if (client.secretHash) {
        const presented = get('client_secret')
        if (!presented || !verifySecret(presented, client.secretHash)) {
          return bad('invalid_client', 401)
        }
      }

      if (grantType === 'authorization_code') {
        const code = get('code')
        const verifier = get('code_verifier')
        const redirectUri = get('redirect_uri')
        if (!code || !verifier) return bad('invalid_request')

        const grant = await store.redeemAuthorizationCode(code)
        // Unknown, expired, or already spent -- one answer for all three.
        if (!grant) return bad('invalid_grant')

        // The code was minted for a different client. Without this a client that
        // can see a code in a redirect can spend somebody else's.
        if (grant.clientId !== client.id) return bad('invalid_grant')
        if (redirectUri !== null && redirectUri !== grant.redirectUri) return bad('invalid_grant')
        if (!verifyCodeChallenge(verifier, grant.codeChallenge)) return bad('invalid_grant')

        // The audience was fixed when the person consented; the token request
        // does not get to widen it.
        const resource = get('resource')
        if (resource !== null && !audienceMatches(grant.resource, resource)) {
          return bad('invalid_target')
        }

        return tokenResponse(
          await store.issueTokens({
            clientId: client.id,
            subjectId: grant.subjectId,
            scopes: grant.scopes,
            resource: grant.resource,
            withRefresh: true,
          }),
        )
      }

      if (grantType === 'refresh_token') {
        const presented = get('refresh_token')
        // An access token presented here is refused by its shape: the separate
        // prefixes exist so this check does not need a lookup. Each store
        // parses its own, so one server's token is not the other's to spend.
        const parsed = presented ? store.parseToken(presented) : null
        if (!parsed || parsed.kind !== 'refresh') return bad('invalid_grant')

        const previous = await store.redeemRefreshToken(parsed.tokenKey, parsed.secret)
        if (!previous || previous.clientId !== client.id) return bad('invalid_grant')

        return tokenResponse(
          await store.issueTokens({
            clientId: client.id,
            subjectId: previous.subjectId,
            scopes: previous.scopes,
            resource: previous.resource,
            withRefresh: true,
          }),
        )
      }

      return bad('unsupported_grant_type')
    })
  }
}

/**
 * RFC 7009. Always 200, whatever happened.
 *
 * That is the specification's own rule and it is the right one: a caller
 * learning that a token was "not found" learns that some OTHER token exists,
 * which is exactly the oracle revocation must not provide. Revoking something
 * already revoked is a success too -- the client's goal is the state, not the
 * transition.
 */
export function revocationEndpoint(open: OpenStore) {
  return async function POST(request: NextRequest) {
    const form = await request.formData().catch(() => null)
    const get = form ? fieldsOf(form) : NO_FIELDS
    const presented = get('token')

    if (presented) {
      const withStore = await open('revoke', get).catch(() => null)
      await withStore?.(async (store) => {
        // Either kind: a client revoking its access token and a client
        // revoking its refresh token are both doing what RFC 7009 is for.
        const parsed = store.parseToken(presented)
        if (parsed) await store.revoke(parsed.tokenKey, parsed.secret)
      }).catch(() => {})
    }

    return new NextResponse(null, { status: 200 })
  }
}

function tokenResponse(issued: {
  accessToken: string
  refreshToken?: string
  expiresIn: number
  scopes: string[]
}) {
  return NextResponse.json(
    {
      access_token: issued.accessToken,
      token_type: 'Bearer',
      expires_in: issued.expiresIn,
      scope: issued.scopes.join(' '),
      ...(issued.refreshToken ? { refresh_token: issued.refreshToken } : {}),
    },
    // A token must not sit in a cache, anybody's.
    { headers: { 'cache-control': 'no-store', pragma: 'no-cache' } },
  )
}
