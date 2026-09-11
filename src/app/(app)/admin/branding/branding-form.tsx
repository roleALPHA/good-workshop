'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { Trash2, Upload } from 'lucide-react'
import { SUGGESTED_BRAND_HEX } from '@/domain/tenant/branding'
import { MAX_LOGO_BYTES } from '@/domain/tenant/logo'
import {
  removeLogoAction,
  saveBrandAction,
  uploadLogoAction,
  type BrandingView,
} from '@/server/actions/branding'
import { useTranslations } from 'next-intl'

/**
 * Edited in place, saved on blur, with the result shown next to the field.
 *
 * A refusal here is a sentence somebody can act on -- "grey has no hue to
 * build an accent from" -- so it belongs beside the input that caused it, not
 * in a banner at the top of the page.
 */
export function BrandingForm({ initial }: { initial: BrandingView }) {
  const t = useTranslations('admin.branding')
  const router = useRouter()
  const file = useRef<HTMLInputElement>(null)

  const [brandName, setBrandName] = useState(initial.brandName)
  const [hex, setHex] = useState(initial.brandHex ?? '')
  const [swatch, setSwatch] = useState(initial.swatch)
  const [hasLogo, setHasLogo] = useState(initial.hasLogo)
  const [colourError, setColourError] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function saveBrand() {
    startTransition(async () => {
      const result = await saveBrandAction({ brandName, brandHex: hex.trim() || null })
      if (!result.ok) {
        setColourError(result.message)
        setSaved(false)
        return
      }
      setColourError(null)
      setSwatch(result.data.swatch)
      setSaved(true)
      router.refresh()
    })
  }

  function upload(chosen: File) {
    setLogoError(null)
    if (chosen.size > MAX_LOGO_BYTES) {
      // Checked here as well as on the server, so an oversized file is refused
      // before it is read and base64-encoded in the browser.
      setLogoError(t('logoTooLarge', { max: Math.round(MAX_LOGO_BYTES / 1024) }))
      return
    }

    startTransition(async () => {
      const base64 = Buffer.from(await chosen.arrayBuffer()).toString('base64')
      const result = await uploadLogoAction({ base64, mime: chosen.type })
      if (!result.ok) {
        setLogoError(result.message)
        return
      }
      setHasLogo(true)
      router.refresh()
    })
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-1 text-[15px] font-semibold">{t('logo')}</h2>
        <p className="mb-3 text-[14px] text-[var(--fg-muted)]">
          {t('logoHint', { max: Math.round(MAX_LOGO_BYTES / 1024) })}
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {hasLogo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/api/tenant/logo"
              alt={t('currentLogo')}
              className="h-10 w-auto max-w-48 rounded border border-[var(--border)] bg-[var(--surface)] object-contain p-1"
            />
          )}

          <input
            ref={file}
            type="file"
            accept="image/svg+xml,image/png,image/webp"
            className="sr-only"
            aria-label={t('logoFile')}
            onChange={(e) => {
              const chosen = e.target.files?.[0]
              if (chosen) upload(chosen)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => file.current?.click()}
            className="inline-flex items-center gap-1.5 rounded border border-[var(--border-strong)] px-3 py-1.5 text-[15px] hover:bg-[var(--surface-raised)] disabled:opacity-60"
          >
            <Upload aria-hidden className="size-4" />
            {hasLogo ? t('replaceLogo') : t('uploadLogo')}
          </button>

          {hasLogo && (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await removeLogoAction()
                  setHasLogo(false)
                  router.refresh()
                })
              }
              className="inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-[15px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)] disabled:opacity-60"
            >
              <Trash2 aria-hidden className="size-4" />
              {t('removeLogo')}
            </button>
          )}
        </div>

        {logoError && (
          <p role="alert" className="mt-2 text-[14px] text-[var(--danger-fg)]">
            {logoError}
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-1 text-[15px] font-semibold">{t('accent')}</h2>
        <p className="mb-3 text-[14px] text-[var(--fg-muted)]">{t('accentHint')}</p>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="brand-hex" className="mb-1 block text-[14px]">
              {t('hex')}
            </label>
            <div className="flex items-center gap-2">
              <input
                id="brand-hex"
                value={hex}
                placeholder={SUGGESTED_BRAND_HEX}
                className="w-32 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-[16px]"
                onChange={(e) => {
                  setHex(e.target.value)
                  setColourError(null)
                  setSaved(false)
                }}
                onBlur={saveBrand}
                onKeyDown={(e) => e.key === 'Enter' && saveBrand()}
              />
              <span
                aria-hidden
                className="size-8 rounded border border-[var(--border)]"
                style={{ background: swatch ?? 'var(--brand)' }}
              />
            </div>
          </div>

          <div>
            <label htmlFor="brand-name" className="mb-1 block text-[14px]">
              {t('brandName')}
            </label>
            <input
              id="brand-name"
              value={brandName}
              placeholder="GoodWorkshop"
              className="w-64 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-[16px]"
              onChange={(e) => {
                setBrandName(e.target.value)
                setSaved(false)
              }}
              onBlur={saveBrand}
              onKeyDown={(e) => e.key === 'Enter' && saveBrand()}
            />
          </div>
        </div>

        {colourError && (
          <p role="alert" className="mt-2 text-[14px] text-[var(--danger-fg)]">
            {colourError}
          </p>
        )}
        {saved && !colourError && (
          <p className="mt-2 text-[14px] text-[var(--fg-muted)]">{t('saved')}</p>
        )}
      </section>
    </div>
  )
}
