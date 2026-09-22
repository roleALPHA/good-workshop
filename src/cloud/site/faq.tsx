import Link from 'next/link'
import type { Route } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { pathFor } from './routes'
import { breadcrumb, faqPage, JsonLd } from './structured-data'

/**
 * The questions people ask before they start, answered where a search engine
 * can find them.
 *
 * The FAQPage markup below is built from the same strings the page prints,
 * in the same order. That is not a convenience: markup describing an answer
 * the page does not show is what Google means by structured-data spam, and
 * the rule is easiest to keep by making one array the source of both.
 */
const ORDER = [
  'cost',
  'free',
  'selfhost',
  'data',
  'ai',
  'collab',
  'times',
  'print',
  'mobile',
  'migrate',
] as const

export async function Faq() {
  const [t, nav, locale] = await Promise.all([
    getTranslations('site.faq'),
    getTranslations('site.nav'),
    getLocale() as Promise<Locale>,
  ])

  const entries = ORDER.map((key) => ({
    key,
    question: t(`entries.${key}.q`),
    answer: t(`entries.${key}.a`),
  }))

  return (
    <div>
      <JsonLd data={faqPage(entries)} />
      <JsonLd data={breadcrumb('faq', locale, t('title'), nav('home'))} />

      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
      <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-[var(--fg-muted)]">
        {t('lead')}
      </p>

      {/* Open, not folded away. A <details> would be tidier and would hide the
          answer from the reader who is skimming for one word -- and the whole
          point of the page is that the answer is on it. */}
      <ul className="mt-10 max-w-3xl">
        {entries.map(({ key, question, answer }) => (
          <li key={key} className="border-t border-[var(--border)] py-6">
            <h2 id={key} className="scroll-mt-4 text-[19px] font-semibold tracking-tight">
              {question}
            </h2>
            <p className="mt-2 text-[16px] leading-relaxed text-[var(--fg-muted)]">{answer}</p>
          </li>
        ))}
      </ul>

      <section
        className="mt-10 max-w-3xl rounded border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="faq-cta"
      >
        <h2 id="faq-cta" className="text-xl font-semibold tracking-tight">
          {t('ctaTitle')}
        </h2>
        <p className="mt-2 text-[15px] text-[var(--fg-muted)]">{t('ctaBody')}</p>
        <Link
          href={'/registrieren' as Route}
          className="mt-4 inline-flex min-h-11 items-center rounded bg-[var(--brand)] px-4 py-3 text-[16px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)]"
        >
          {t('cta')}
        </Link>
        <p className="mt-3 text-[14px]">
          <Link href={pathFor('pricing', locale) as Route} className="underline underline-offset-2">
            {nav('pricing')}
          </Link>
        </p>
      </section>
    </div>
  )
}
