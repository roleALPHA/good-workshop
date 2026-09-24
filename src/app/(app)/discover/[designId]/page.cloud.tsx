import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { catalog } from '@gw/catalog'
import { loadLibrary } from '@/server/actions/workshop'
import { formatDuration } from '@/features/agenda/duration'
import { LegalMarkdown } from '@/cloud/legal/markdown'
import type { DesignDay, DesignDetail } from '@/cloud/catalog/ports'
import type { Locale } from '@/i18n/config'
import { People } from '../people'
import { AdoptPanel } from '../adopt-panel'

/**
 * One design, day by day, before anybody adopts it.
 *
 * The whole point of the screen is that a person sees what they are getting:
 * how many days, what is in them, how long each block runs -- and only then
 * the control that writes it into their workspace. The function behind that
 * control is the same one the MCP tool calls, so that a model never gains a
 * power the interface does not have.
 *
 * Addressed by id and not a slug: a design has no slug anywhere in this
 * feature, so there is no public address for one to leak. See ports.ts.
 */
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ designId: string }> }

async function read({ params }: Props): Promise<DesignDetail> {
  const [{ designId }, locale] = await Promise.all([params, getLocale() as Promise<Locale>])
  const design = await catalog.getDesign(designId, locale)
  // A design that was withdrawn while somebody had the list open is a 404, not
  // an empty page: a soft 404 is how an index fills with addresses that were
  // never real.
  if (!design) notFound()
  return design
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  return { title: (await read(props)).name }
}

export default async function DesignPage(props: Props) {
  const [design, t, library] = await Promise.all([
    read(props),
    getTranslations('discover'),
    // The workshops this person could append to. One page of them: the choice
    // is "which of mine", and somebody with three hundred workshops picks the
    // one they just opened, not the two hundredth.
    loadLibrary(),
  ])
  const workshops = library.ok
    ? library.data.workshops.map((workshop) => ({ id: workshop.id, title: workshop.title }))
    : []

  return (
    <div className="max-w-3xl">
      <p className="text-[14px]">
        <Link href={'/discover' as Route} className="underline underline-offset-2">
          {t('back')}
        </Link>
      </p>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{design.name}</h1>
      <p className="mt-2 text-[16px] text-[var(--fg-muted)]">{design.summary}</p>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-[var(--fg-subtle)]">
        <span className="tabular-nums">{t('days', { count: design.dayCount })}</span>
        <span className="tabular-nums">
          {formatDuration(design.durationMinutes, { spaced: true })}
        </span>
        <span>
          <People range={design} />
        </span>
      </p>

      {design.facets.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-2">
          {design.facets.map((facet) => (
            <span
              key={`${facet.key}-${facet.label}`}
              className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[13px] text-[var(--fg-muted)]"
            >
              {facet.label}
            </span>
          ))}
        </p>
      )}

      {!design.translated && (
        <p className="mt-3 text-[13px] text-[var(--fg-subtle)]">{t('untranslated')}</p>
      )}

      {/* The catalogue stores Markdown, and this is the one renderer in the
          tree that turns Markdown into a bounded set of elements. Reused
          rather than reached for a second parser: whatever is safe for a legal
          text is safe for a design description. */}
      {design.body && (
        <div className="mt-6">
          <LegalMarkdown source={design.body} />
        </div>
      )}

      <div className="mt-8">
        <AdoptPanel
          designId={design.id}
          workshops={workshops}
          labels={{
            title: t('adoptTitle'),
            asNew: t('adoptNew'),
            append: t('adoptAppend'),
            choose: t('adoptChoose'),
            submit: t('adoptSubmit'),
            working: t('adoptWorking'),
            open: t('adoptOpen'),
            noWorkshops: t('adoptNoWorkshops'),
          }}
        />
      </div>

      <div className="mt-8">
        {design.days.map((day, index) => (
          <Day key={`${index}-${day.title}`} day={day} number={index + 1} />
        ))}
      </div>
    </div>
  )
}

async function Day({ day, number }: { day: DesignDay; number: number }) {
  const t = await getTranslations('discover')

  return (
    <section
      className="mt-6 border-t border-[var(--border)] pt-5"
      aria-labelledby={`day-${number}`}
    >
      <h2 id={`day-${number}`} className="text-[17px] font-semibold tracking-tight">
        {day.title || t('dayHeading', { n: number })}
      </h2>

      <ul className="mt-3">
        {day.items.map((item, index) =>
          item.kind === 'cluster' ? (
            <li key={`c-${index}`} className="mt-3">
              <h3 className="text-[15px] font-medium">{item.title}</h3>
              <ul className="mt-1 border-l border-[var(--border)] pl-3">
                {item.children.map((block, child) => (
                  <Block key={`b-${child}`} block={block} parked={t('parked')} />
                ))}
              </ul>
            </li>
          ) : (
            <Block key={`b-${index}`} block={item} parked={t('parked')} />
          ),
        )}
      </ul>
    </section>
  )
}

function Block({
  block,
  parked,
}: {
  block: { title: string; durationMinutes: number; parked: boolean }
  parked: string
}) {
  return (
    <li className="flex items-baseline gap-3 py-1.5">
      {/* The duration first and in tabular figures, so a day reads as a column
          of times rather than a paragraph. */}
      <span className="w-14 shrink-0 text-[14px] text-[var(--fg-subtle)] tabular-nums">
        {formatDuration(block.durationMinutes)}
      </span>
      <span className="text-[15px]">
        {block.title}
        {block.parked && (
          <span className="ml-2 text-[13px] text-[var(--fg-subtle)]">({parked})</span>
        )}
      </span>
    </li>
  )
}
