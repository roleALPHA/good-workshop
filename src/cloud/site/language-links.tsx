import Link from 'next/link'
import type { Route } from 'next'
import { headers } from 'next/headers'
import { getLocale, getTranslations } from 'next-intl/server'
import { Languages } from 'lucide-react'
import { LOCALE_LABELS, LOCALES, type Locale } from '@/i18n/config'
import { LanguageSwitcher } from '@/components/settings/language-switcher'
import { pageForPath, pathFor } from './routes'

/**
 * The language switcher of the public website: links, not a form.
 *
 * The switcher used everywhere else sets the `gw_locale` cookie, which is the
 * right mechanism behind the login, where the language belongs to the person.
 * Out here it would be the wrong one twice over. The address decides the
 * language on these pages (src/middleware.ts), so a cookie would change
 * nothing a reader can see -- and the four translations of a page are four
 * addresses, which is precisely what a link is for.
 *
 * It is also the third place Google accepts an hreflang annotation, after the
 * sitemap and the <head>: four ordinary links, pointing at the same page in
 * the other three languages, from every page of the site.
 */
export async function LanguageLinks() {
  const [headerList, current, t] = await Promise.all([
    headers(),
    getLocale() as Promise<Locale>,
    getTranslations('settings.language'),
  ])

  // Set by src/middleware.ts. A page with no entry in the table has no four
  // addresses to link between -- /registrieren is one, and it is still a page
  // somebody may need in another language, so it falls back to the cookie.
  const here = pageForPath(headerList.get('x-pathname') ?? '')
  if (!here) return <LanguageSwitcher compact />

  return (
    <nav aria-label={t('label')} className="flex flex-wrap items-center justify-center gap-x-3">
      <Languages aria-hidden className="size-4 shrink-0 text-[var(--fg-muted)]" />
      {LOCALES.map((locale) => {
        const label = LOCALE_LABELS[locale]
        return locale === current ? (
          <span key={locale} aria-current="true" className="py-2 text-[14px] font-medium">
            {label}
          </span>
        ) : (
          <Link
            key={locale}
            href={pathFor(here.page, locale) as Route}
            hrefLang={locale}
            className="py-2 text-[14px] text-[var(--fg-muted)] underline-offset-2 hover:underline"
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
