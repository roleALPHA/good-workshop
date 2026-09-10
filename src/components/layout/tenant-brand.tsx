import { cache } from 'react'
import { eq } from 'drizzle-orm'
import { brandCss, readBrand } from '@/domain/tenant/branding'
import { authConfig } from '@/server/auth/config'
import { withTenantOnly } from '@/server/db'
import { tenant } from '@/server/db/schema'

/**
 * A tenant's mark on their own installation.
 *
 * Server-rendered into the document, never applied by client JavaScript: a
 * brand colour that arrives after hydration is a visible flash of somebody
 * else's palette on every page load.
 */

export type TenantBrand = { name: string; hex: string | null; hasLogo: boolean }

/**
 * Read once per request.
 *
 * Both the style block and the logo need it, and rendering the same row twice
 * per page for two sibling components is the kind of waste that never shows up
 * anywhere except in the database's own metrics.
 */
export const loadTenantBrand = cache(async (): Promise<TenantBrand> => {
  // One tenant in the community edition; the cloud edition resolves it from
  // the subdomain, which is the only line that changes.
  const tenantId = authConfig.defaultTenantId

  const rows = await withTenantOnly(tenantId, (tx) =>
    tx
      .select({ name: tenant.brandName, hex: tenant.brandHex, mime: tenant.logoMime })
      .from(tenant)
      .where(eq(tenant.id, tenantId))
      .limit(1),
  ).catch(() => [])

  const row = rows[0]
  return { name: row?.name ?? '', hex: row?.hex ?? null, hasLogo: Boolean(row?.mime) }
})

/**
 * The two axes a tenant owns, as custom properties.
 *
 * Only hue and chroma. Every lightness step stays in the stylesheet, where it
 * has been checked -- so there is no way for a tenant to configure themselves
 * into an interface they cannot read, and no second copy of the ramp to drift.
 */
export async function BrandStyle() {
  const brand = await loadTenantBrand()
  if (!brand.hex) return null

  const css = safely(brand.hex)
  return css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null
}

/** The wordmark, or the tenant's logo where they have set one. */
export async function BrandMark({ className }: { className?: string }) {
  const brand = await loadTenantBrand()

  if (brand.hasLogo) {
    return (
      // A tenant upload of unknown dimensions, served from our own route.
      // next/image would add an optimiser round trip for one small file that is
      // already capped at 256 KB.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src="/api/tenant/logo"
        alt={brand.name || 'Logo'}
        className={className ?? 'h-6 w-auto max-w-40 object-contain'}
      />
    )
  }

  return <span className="font-semibold tracking-tight">{brand.name || 'GoodWorkshop'}</span>
}

/**
 * A stored colour is validated again on the way out.
 *
 * It was checked when it was saved, but a row can also be written by a
 * migration, a restore or somebody with psql -- and none of those paths went
 * through the form.
 */
function safely(hex: string): string | null {
  try {
    return brandCss(readBrand(hex))
  } catch {
    return null
  }
}
