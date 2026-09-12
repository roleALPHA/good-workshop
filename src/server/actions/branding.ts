'use server'

import { revalidatePath } from 'next/cache'
import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'
import { brandSwatch, readBrand } from '@/domain/tenant/branding'
import { readLogo } from '@/domain/tenant/logo'
import { assertTenantAdmin } from '@/domain/tenant/members'
import { withTenant } from '@/server/db'
import { tenant } from '@/server/db/schema'
import { currentActor, fail, toResult, type ActionResult } from './context'

/**
 * Tenant branding: one accent colour and one logo.
 *
 * Deliberately narrow. Category colours are not reachable from here -- they
 * are semantics, and a tenant painting their corporate blue over every module
 * type would make the agenda unreadable.
 */

export type BrandingView = {
  brandName: string
  brandHex: string | null
  swatch: string | null
  hasLogo: boolean
}

export async function loadBranding(): Promise<ActionResult<BrandingView>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  try {
    assertTenantAdmin(actor)
    const row = await withTenant(actor, (tx) =>
      tx
        .select({
          brandName: tenant.brandName,
          brandHex: tenant.brandHex,
          logoMime: tenant.logoMime,
        })
        .from(tenant)
        .where(eq(tenant.id, actor.tenantId))
        .limit(1),
    )

    const found = row[0]
    return {
      ok: true,
      data: {
        brandName: found?.brandName ?? '',
        brandHex: found?.brandHex ?? null,
        swatch: found?.brandHex ? brandSwatch(readBrand(found.brandHex)) : null,
        hasLogo: Boolean(found?.logoMime),
      },
    }
  } catch (error) {
    return toResult(error)
  }
}

export async function saveBrandAction(raw: {
  brandName: string
  brandHex: string | null
}): Promise<ActionResult<{ swatch: string | null }>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  const parsed = z
    .object({ brandName: z.string().trim().max(120), brandHex: z.string().trim().nullable() })
    .safeParse(raw)
  if (!parsed.success) return fail('invalid_input', 'brand.checkNameAndColour')

  try {
    assertTenantAdmin(actor)

    // Validated before it is stored, not when it is rendered: a colour that
    // fails is a message on this form, never a page somebody cannot read.
    const hex = parsed.data.brandHex?.trim() || null
    const brand = hex ? readBrand(hex) : null

    await withTenant(actor, (tx) =>
      tx
        .update(tenant)
        .set({
          brandName: parsed.data.brandName || null,
          brandHex: hex ? hex.toLowerCase() : null,
          updatedAt: sql`now()`,
        })
        .where(eq(tenant.id, actor.tenantId)),
    )

    revalidatePath('/', 'layout')
    return { ok: true, data: { swatch: brand ? brandSwatch(brand) : null } }
  } catch (error) {
    return toResult(error)
  }
}

export async function uploadLogoAction(raw: {
  base64: string
  mime: string
}): Promise<ActionResult<null>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  try {
    assertTenantAdmin(actor)
    const bytes = Buffer.from(raw.base64, 'base64')
    const logo = readLogo(new Uint8Array(bytes), raw.mime)

    await withTenant(actor, (tx) =>
      tx
        .update(tenant)
        .set({
          logo: logo.data,
          logoMime: logo.mime,
          logoUpdatedAt: sql`now()`,
          updatedAt: sql`now()`,
        })
        .where(eq(tenant.id, actor.tenantId)),
    )

    revalidatePath('/', 'layout')
    return { ok: true, data: null }
  } catch (error) {
    return toResult(error)
  }
}

export async function removeLogoAction(): Promise<ActionResult<null>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  try {
    assertTenantAdmin(actor)
    await withTenant(actor, (tx) =>
      tx
        .update(tenant)
        .set({ logo: null, logoMime: null, logoUpdatedAt: sql`now()`, updatedAt: sql`now()` })
        .where(eq(tenant.id, actor.tenantId)),
    )

    revalidatePath('/', 'layout')
    return { ok: true, data: null }
  } catch (error) {
    return toResult(error)
  }
}
