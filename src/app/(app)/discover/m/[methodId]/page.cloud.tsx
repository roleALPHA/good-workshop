import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { catalog } from '@gw/catalog'
import { loadLibrary } from '@/server/actions/workshop'
import { formatDuration } from '@/features/agenda/duration'
import { LegalMarkdown } from '@/cloud/legal/markdown'
import { descriptionMarkdown } from '@/cloud/catalog/method-body'
import type { MethodDetail } from '@/cloud/catalog/ports'
import type { Locale } from '@/i18n/config'
import { People } from '../../people'
import { AdoptMethodPanel } from '../../adopt-method-panel'

/**
 * One method, and the control that puts it into a day.
 *
 * ADDRESSED BY ID, NOT BY ITS SLUG, and that is not a detail. A method does
 * have a slug -- it has a public page on the marketing site, and it needs a
 * readable address there. But a slug is unique per LANGUAGE
 * (`catalog_text_slug_unique`), so two methods may hold the same one in
 * different languages. On the public site the language is part of the path, so
 * the pair is always unambiguous; here the language comes from the session, so
 * the same link would open a DIFFERENT method for a colleague reading in
 * another language, with a 200 and nothing to notice it by.
 *
 * The public page and this one also answer differently on purpose: there, a
 * method not published in the language of the path is a 404, because the
 * address does not exist. Here it falls back to English and says so, because
 * the address is the method and the reader is a person with a session.
 */
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ methodId: string }> }

async function read({ params }: Props): Promise<MethodDetail> {
  const [{ methodId }, locale] = await Promise.all([params, getLocale() as Promise<Locale>])
  const method = await catalog.getMethodById(methodId, locale)
  // Withdrawn while somebody had the list open is a 404, not an empty page.
  if (!method) notFound()
  return method
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  return { title: (await read(props)).name }
}

export default async function MethodPage(props: Props) {
  const [method, t, library] = await Promise.all([
    read(props),
    getTranslations('discover'),
    // The workshops this person could put it into. One page of them, for the
    // reason the design page gives: the choice is "which of mine".
    loadLibrary(),
  ])
  const workshops = library.ok
    ? library.data.workshops.map((workshop) => ({ id: workshop.id, title: workshop.title }))
    : []

  // What the block will actually carry, so the page shows the prose that is
  // going to travel rather than a `body` every shipped method leaves empty.
  const prose = descriptionMarkdown(method)

  return (
    <div>
      <p className="text-[14px]">
        <Link href={'/discover' as Route} className="underline underline-offset-2">
          {t('back')}
        </Link>
      </p>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{method.name}</h1>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-[var(--fg-subtle)]">
        <span className="rounded-full border border-[var(--border-strong)] px-2 py-0.5 text-[13px] text-[var(--fg-muted)]">
          {t('kindMethod')}
        </span>
        <span className="tabular-nums">
          {formatDuration(method.durationMinutes, { spaced: true })}
        </span>
        <span>
          <People range={method} />
        </span>
      </p>

      {method.facets.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-2">
          {method.facets.map((facet) => (
            <span
              key={`${facet.key}-${facet.label}`}
              className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[13px] text-[var(--fg-muted)]"
            >
              {facet.label}
            </span>
          ))}
        </p>
      )}

      {!method.translated && (
        <p className="mt-3 text-[13px] text-[var(--fg-subtle)]">{t('untranslated')}</p>
      )}

      {/* The same renderer the legal texts and the design bodies use: whatever
          is safe for a legal text is safe for a method. */}
      {prose && (
        <div className="mt-6">
          <LegalMarkdown source={prose} />
        </div>
      )}

      <div className="mt-8">
        <AdoptMethodPanel
          methodId={method.id}
          workshops={workshops}
          labels={{
            title: t('adoptMethodTitle'),
            asNew: t('adoptNew'),
            intoDay: t('adoptIntoDay'),
            chooseWorkshop: t('adoptChoose'),
            chooseDay: t('adoptChooseDay'),
            submit: t('adoptSubmit'),
            working: t('adoptWorking'),
            open: t('adoptMethodOpen'),
            noWorkshops: t('adoptNoWorkshops'),
            noDays: t('adoptNoDays'),
            degraded: t('adoptMethodDegraded'),
            dropped: t('adoptMethodDropped'),
          }}
        />
      </div>
    </div>
  )
}
