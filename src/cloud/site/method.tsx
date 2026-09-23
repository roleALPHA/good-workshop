import Link from 'next/link'
import type { Route } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { catalog } from '@gw/catalog'
import { formatDuration } from '@/features/agenda/duration'
import { LegalMarkdown } from '@/cloud/legal/markdown'
import type { Locale } from '@/i18n/config'
import { methodPathFor, pathFor } from './routes'
import { breadcrumb, JsonLd, methodArticle } from './structured-data'

/**
 * One method, on a page of its own.
 *
 * The SEO argument for the split is the whole reason this exists: a directory
 * of thirty methods is one address competing for thirty different questions,
 * and loses all of them. A page per method is what a search for "dot voting"
 * can actually land on.
 *
 * WHAT THIS PAGE NEVER SHOWS: a design. Not which designs use the method, not
 * a day structure, not an agenda. That is not discipline -- a design has no
 * slug anywhere in this feature, so there is no address to leak. The reader
 * here (`catalog.getMethod`) cannot reach a design at all.
 */
export async function Method({ slug }: { slug: string }) {
  const [locale, t, nav] = await Promise.all([
    getLocale() as Promise<Locale>,
    getTranslations('site.methods'),
    getTranslations('site.nav'),
  ])

  // Unpublished, withdrawn, or published in a language that is not this one:
  // all of them are "not here", and a soft 404 is how an index fills up with
  // addresses that were never real.
  const method = await catalog.getMethod(slug, locale)
  if (!method) notFound()

  const path = methodPathFor(method.slug, locale)

  return (
    <article className="max-w-3xl">
      <JsonLd
        data={methodArticle({
          name: method.name,
          description: method.summary,
          locale,
          path,
        })}
      />
      <JsonLd
        data={breadcrumb('methods', locale, t('title'), nav('home'), {
          name: method.name,
          path,
        })}
      />

      <p className="text-[14px]">
        <Link href={pathFor('methods', locale) as Route} className="underline underline-offset-2">
          {t('back')}
        </Link>
      </p>

      <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{method.name}</h1>

      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[14px] text-[var(--fg-subtle)]">
        <div className="flex gap-2">
          <dt>{t('durationLabel')}:</dt>
          <dd className="text-[var(--fg-muted)] tabular-nums">
            {formatDuration(method.durationMinutes, { spaced: true })}
          </dd>
        </div>
        {method.facets.map((facet) => (
          <div key={facet.key} className="flex gap-2">
            <dt>{t('socialLabel')}:</dt>
            <dd className="text-[var(--fg-muted)]">{facet.label}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 text-[17px] leading-relaxed text-[var(--fg-muted)]">{method.summary}</p>

      {/* The catalogue stores Markdown, and this is the one renderer in the
          tree that turns it into a bounded set of elements. Reused rather than
          a second parser: what is safe for a legal text is safe here. */}
      {method.body && (
        <div className="mt-6">
          <LegalMarkdown source={method.body} />
        </div>
      )}

      <section
        className="mt-10 rounded border border-[var(--border)] bg-[var(--surface)] p-5"
        aria-labelledby="method-cta"
      >
        <h2 id="method-cta" className="text-xl font-semibold tracking-tight">
          {t('ctaTitle')}
        </h2>
        <p className="mt-2 text-[15px] text-[var(--fg-muted)]">{t('ctaBody')}</p>
        <Link
          href={'/registrieren' as Route}
          className="mt-4 inline-flex min-h-11 items-center rounded bg-[var(--brand)] px-4 py-3 text-[16px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)]"
        >
          {t('cta')}
        </Link>
      </section>
    </article>
  )
}
