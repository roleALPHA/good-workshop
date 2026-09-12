import { NextResponse, type NextRequest } from 'next/server'
import { withTenant } from '@/server/db'
import { authConfig } from '@/server/auth/config'
import { rateLimiter } from '@/server/auth/ratelimit'
import { clientAddress } from '@/server/auth/client-address'
import { OAuthError, registerClient } from '@/domain/oauth/repo'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * RFC 7591 Dynamic Client Registration, open by design.
 *
 * The MCP specification expects a client the operator has never heard of to be
 * able to start the flow, so there is no credential in front of this. What
 * keeps it from being a hole is that a registration grants NOTHING: it is a
 * name and a redirect target, and every permission still comes from a person at
 * the consent screen. A registration nobody consents to is a row that does
 * nothing, forever.
 *
 * What open registration IS, is a place to write rows -- so it is rate limited
 * per address, which is the only defence that makes sense for an endpoint that
 * must stay reachable by strangers.
 */
const registrations = rateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 })

export async function POST(request: NextRequest) {
  if (!registrations.take(clientAddress(request.headers))) {
    return NextResponse.json({ error: 'too_many_requests' }, { status: 429 })
  }

  const body = (await request.json().catch(() => null)) as {
    client_name?: unknown
    redirect_uris?: unknown
    token_endpoint_auth_method?: unknown
  } | null

  const redirectUris = Array.isArray(body?.redirect_uris) ? (body.redirect_uris as unknown[]) : null
  if (!body || !redirectUris) {
    return NextResponse.json(
      { error: 'invalid_client_metadata', error_description: 'redirect_uris is required' },
      { status: 400 },
    )
  }

  const actor = {
    tenantId: authConfig.defaultTenantId,
    memberId: null,
    tenantRole: 'member' as const,
    source: 'mcp' as const,
  }

  try {
    const client = await withTenant(actor, (tx) =>
      registerClient(tx, {
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
