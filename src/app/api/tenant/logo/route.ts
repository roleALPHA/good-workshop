import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { readSession } from '@/server/auth/session'
import { readGuestSession } from '@/server/auth/share-session'
import { edition } from '@/server/edition'
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
  // The same rule as loadTenantBrand in src/components/layout/tenant-brand.tsx:
  // your own tenant when signed in, the edition's answer when not.
  const session = await readSession().catch(() => null)
  const guest = session ? null : await readGuestSession().catch(() => null)
  const tenantId = session?.tenantId ?? guest?.tenantId ?? (await edition.tenantForAnonymousBrand())
  if (!tenantId) return new NextResponse(null, { status: 404 })

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
