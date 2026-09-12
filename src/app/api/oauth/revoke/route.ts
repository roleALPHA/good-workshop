import { NextResponse, type NextRequest } from 'next/server'
import { and, eq, sql } from 'drizzle-orm'
import { withTenant } from '@/server/db'
import { authConfig } from '@/server/auth/config'
import { oauthToken } from '@/server/db/schema'
import { hashSecret, parseOAuthToken } from '@/server/auth/tokens'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * RFC 7009. Always 200, whatever happened.
 *
 * That is the specification's own rule and it is the right one: a caller
 * learning that a token was "not found" learns that some OTHER token exists,
 * which is exactly the oracle revocation must not provide. Revoking something
 * already revoked is a success too -- the client's goal is the state, not the
 * transition.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null)
  const presented = form?.get('token')
  const parsed = typeof presented === 'string' ? parseOAuthToken(presented) : null

  if (parsed) {
    await withTenant(
      {
        tenantId: authConfig.defaultTenantId,
        memberId: null,
        tenantRole: 'member',
        source: 'mcp',
      },
      (tx) =>
        tx
          .update(oauthToken)
          .set({ revokedAt: sql`now()` })
          .where(
            and(
              eq(oauthToken.tokenKey, parsed.tokenKey),
              eq(oauthToken.secretHash, hashSecret(parsed.secret)),
            ),
          ),
    ).catch(() => {})
  }

  return new NextResponse(null, { status: 200 })
}
