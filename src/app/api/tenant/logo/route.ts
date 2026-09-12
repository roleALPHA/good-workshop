import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authConfig } from '@/server/auth/config'
import { withTenantOnly } from '@/server/db'
import { tenant } from '@/server/db/schema'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The tenant's logo.
 *
 * Unauthenticated on purpose: the login page shows it, and a login page that
 * needs a session to render its own branding is a login page that shows a gap.
 * Nothing here is private -- it is the mark an organisation puts on its own
 * front door.
 *
 * Served as a file into an `<img>`, never inlined. Browsers do not run script
 * in an SVG loaded that way, which is the strongest of the several things
 * standing between a tenant admin's upload and everybody else's browser.
 */
export async function GET(request: Request) {
  // The community edition has one tenant. The cloud edition resolves it from
  // the subdomain, which is the only line that changes.
  const tenantId = authConfig.defaultTenantId

  const row = await withTenantOnly(tenantId, (tx) =>
    tx
      .select({ logo: tenant.logo, mime: tenant.logoMime, updatedAt: tenant.logoUpdatedAt })
      .from(tenant)
      .where(eq(tenant.id, tenantId))
      .limit(1),
  ).catch(() => [])

  const found = row[0]
  if (!found?.logo || !found.mime) {
    return new NextResponse(null, { status: 404 })
  }

  const etag = `"${found.updatedAt?.getTime() ?? 0}"`
  if (request.headers.get('if-none-match') === etag) {
    return new NextResponse(null, { status: 304, headers: { etag } })
  }

  return new NextResponse(Buffer.from(found.logo, 'base64'), {
    headers: {
      'content-type': found.mime,
      etag,
      // Revalidated every time rather than cached for a day: a logo changes
      // rarely, but when it does the whole point is that everybody sees it.
      // The ETag makes that cost one 304.
      'cache-control': 'private, no-cache, must-revalidate',
      // An SVG is markup. If anything ever loads this outside an <img>, it
      // must still not be able to reach out or run.
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'x-content-type-options': 'nosniff',
    },
  })
}
