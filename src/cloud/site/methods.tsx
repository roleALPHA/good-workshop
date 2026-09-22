import Link from 'next/link'
import type { Route } from 'next'
import { getLocale, getTranslations } from 'next-intl/server'
import type { Locale } from '@/i18n/config'
import { pathFor } from './routes'
import { breadcrumb, itemList, JsonLd } from './structured-data'

/**
 * The fifteen block types, written out for somebody who is not a customer yet.
 *
 * This page exists because of how people look for a workshop planner: almost
 * nobody searches for one. They search for "check-in Methode", "wie lange
 * dauert eine Gruppenarbeit", "Energizer nach dem Mittagessen" -- and a tool
 * that has nothing to say about those questions is never in the answer.
 *
 * The order is the order of a day rather than the alphabet, and it is the
 * argument of the page: arrival, input, work, decision, closing, with the
 * blocks that carry no content at the end. Sorting it A-Z would lose that and
 * gain nothing -- fifteen entries need no index.
 */
const ORDER = [
  'admin',
  'check_in',
  'presentation',
  'group_work',
  'exercise',
  'discussion',
  'decision',
  'reflection',
  'energizer',
  'break',
  'lunch',
  'buffer',
  'next_steps',
  'check_out',
  'note',
] as const

export async function Methods() {
  const [t, nav, locale] = await Promise.all([
    getTranslations('site.methods'),
    getTranslations('site.nav'),
    getLocale() as Promise<Locale>,
  ])

  const entries = ORDER.map((key) => ({
    key,
    name: t(`entries.${key}.name`),
    body: t(`entries.${key}.body`),
    duration: t(`entries.${key}.duration`),
    social: t(`entries.${key}.social`),
  }))

  return (
    <div>
      {/* Only what the page also shows a reader: fifteen named things, in the
          order they stand in. */}
      <JsonLd
        data={itemList(
          t('title'),
          entries.map(({ name, body }) => ({ name, description: body })),
        )}
      />
      <JsonLd data={breadcrumb('methods', locale, t('title'), nav('home'))} />

      <h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-4xl">{t('title')}</h1>
      <p className="mt-4 max-w-3xl text-[17px] leading-relaxed text-[var(--fg-muted)]">
        {t('lead')}
      </p>

      {/* A list, not a grid: these are read one after another, and a reader who
          arrives from a search for one of them lands on its heading. */}
      <ul className="mt-10 max-w-3xl">
        {entries.map(({ key, name, body, duration, social }) => (
          <li key={key} className="border-t border-[var(--border)] py-6">
            {/* The id is the block type's own key, so a link to a method stays
                valid in every language even though the heading does not. */}
            <h2 id={key} className="scroll-mt-4 text-xl font-semibold tracking-tight">
              {name}
            </h2>
            <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-[var(--fg-subtle)]">
              <div className="flex gap-2">
                <dt>{t('durationLabel')}:</dt>
                <dd className="text-[var(--fg-muted)]">{duration}</dd>
              </div>
              <div className="flex gap-2">
                <dt>{t('socialLabel')}:</dt>
                <dd className="text-[var(--fg-muted)]">{social}</dd>
              </div>
            </dl>
            <p className="mt-3 text-[16px] leading-relaxed text-[var(--fg-muted)]">{body}</p>
          </li>
        ))}
      </ul>

      <section
        className="mt-10 max-w-3xl border-t border-[var(--border)] pt-8"
        aria-labelledby="how"
      >
        <h2 id="how" className="text-xl font-semibold tracking-tight">
          {t('howTitle')}
        </h2>
        <p className="mt-3 text-[16px] leading-relaxed text-[var(--fg-muted)]">{t('howBody')}</p>
      </section>

      <section
        className="mt-10 max-w-3xl rounded border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="methods-cta"
      >
        <h2 id="methods-cta" className="text-xl font-semibold tracking-tight">
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
          <Link href={pathFor('faq', locale) as Route} className="underline underline-offset-2">
            {nav('faq')}
          </Link>
        </p>
      </section>
    </div>
  )
}
