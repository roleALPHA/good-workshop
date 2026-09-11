import { getLocale, getTranslations } from 'next-intl/server'
import { Languages } from 'lucide-react'
import { LOCALE_LABELS, LOCALES } from '@/i18n/config'
import { setLocaleAction } from '@/server/actions/locale'

/**
 * A plain form, on purpose.
 *
 * No 'use client', no onChange handler: this renders on the login page, where a
 * first-time visitor with a French browser is the whole reason it exists, and
 * it has to work before hydration -- and on a phone on a hotel network, before
 * hydration may mean "for several seconds".
 *
 * Each language is written in its own language. "German / Allemand / Alemán"
 * only helps somebody who already reads the page; "Deutsch" helps the person
 * looking for the one word they recognise.
 */
export async function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const [locale, t] = await Promise.all([getLocale(), getTranslations('settings.language')])

  return (
    <form action={setLocaleAction} className="flex items-center gap-2">
      {compact ? (
        <Languages aria-hidden className="size-4 shrink-0 text-[var(--fg-muted)]" />
      ) : null}
      <label className="sr-only" htmlFor="gw-locale">
        {t('label')}
      </label>
      <select
        id="gw-locale"
        name="locale"
        defaultValue={locale}
        className="min-h-11 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[15px]"
      >
        {LOCALES.map((option) => (
          <option key={option} value={option}>
            {LOCALE_LABELS[option]}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="min-h-11 rounded border border-[var(--border)] px-3 py-1 text-[15px] hover:bg-[var(--surface-raised)]"
      >
        {t('apply')}
      </button>
    </form>
  )
}
