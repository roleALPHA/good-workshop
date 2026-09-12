import { NextResponse, type NextRequest } from 'next/server'
import { withTenant } from '@/server/db'
import { authConfig } from '@/server/auth/config'
import { rateLimiter } from '@/server/auth/ratelimit'
import { clientAddress } from '@/server/auth/client-address'
import { hashSecret, parseOAuthToken, verifySecret } from '@/server/auth/tokens'
import {
  findClient,
  issueTokens,
  redeemAuthorizationCode,
  redeemRefreshToken,
} from '@/domain/oauth/repo'
import { audienceMatches, verifyCodeChallenge } from '@/domain/oauth/rules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The token endpoint: two grants, and the checks that make each one safe.
 *
 * Errors are deliberately uniform -- `invalid_grant` for every way a code or a
 * refresh token can fail. Telling a caller WHICH part was wrong (the code is
 * unknown / expired / already spent / belongs to another client) is telling an
 * attacker which half of their guess was right.
 */
const attempts = rateLimiter({ limit: 60, windowMs: 60_000 })

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

const actorFor = () => ({
  tenantId: authConfig.defaultTenantId,
  memberId: null,
  tenantRole: 'member' as const,
  source: 'mcp' as const,
})

export async function POST(request: NextRequest) {
  if (!attempts.take(clientAddress(request.headers))) return bad('slow_down', 429)

  const form = await request.formData().catch(() => null)
  if (!form) return bad('invalid_request')

  const get = (key: string) => {
    const value = form.get(key)
    return typeof value === 'string' ? value : null
  }

  const grantType = get('grant_type')
  const clientKey = get('client_id')
  if (!clientKey) return bad('invalid_client', 401)

  return withTenant(actorFor(), async (tx) => {
    const client = await findClient(tx, clientKey)
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

      const grant = await redeemAuthorizationCode(tx, code)
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

      const issued = await issueTokens(tx, {
        clientId: client.id,
        memberId: grant.memberId,
        scopes: grant.scopes,
        resource: grant.resource,
        withRefresh: true,
      })
      return tokenResponse(issued)
    }

    if (grantType === 'refresh_token') {
      const presented = get('refresh_token')
      const parsed = presented ? parseOAuthToken(presented) : null
      // An access token presented here is refused by its shape: the two
      // prefixes exist so this check does not need a lookup.
      if (!parsed || parsed.kind !== 'refresh') return bad('invalid_grant')

      const previous = await redeemRefreshToken(tx, parsed.tokenKey, hashSecret(parsed.secret))
      if (!previous || previous.clientId !== client.id) return bad('invalid_grant')

      const issued = await issueTokens(tx, {
        clientId: client.id,
        memberId: previous.memberId,
        scopes: previous.scopes,
        resource: previous.resource,
        withRefresh: true,
      })
      return tokenResponse(issued)
    }

    return bad('unsupported_grant_type')
  })
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
