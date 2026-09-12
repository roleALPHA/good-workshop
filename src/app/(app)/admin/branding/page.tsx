import { getTranslations } from 'next-intl/server'
import { loadBranding } from '@/server/actions/branding'
import { BrandingForm } from './branding-form'

export const dynamic = 'force-dynamic'

/**
 * The tenant's own mark on their installation.
 *
 * Two things and no more: a logo and one accent colour. Category colours are
 * deliberately not here -- they mean "this is a break", and a tenant painting
 * their corporate blue over every module type would make the agenda
 * unreadable. Those are changed one at a time, per module type.
 */
export default async function BrandingPage() {
  const t = await getTranslations('admin.branding')
  const result = await loadBranding()

  if (!result.ok) {
    return (
      <div>
        <h1 className="mb-2 text-xl font-semibold tracking-tight">{t('title')}</h1>
        <p role="alert" className="text-[15px] text-[var(--fg-muted)]">
          {result.message}
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mb-6 text-[15px] text-[var(--fg-muted)]">{t('intro')}</p>
      <BrandingForm initial={result.data} />
    </div>
  )
}
