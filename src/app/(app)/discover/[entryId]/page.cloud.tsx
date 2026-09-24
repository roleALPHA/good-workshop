import type { Metadata } from 'next'
import Link from 'next/link'
import type { Route } from 'next'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { catalog } from '@gw/catalog'
import { loadLibrary } from '@/server/actions/workshop'
import { formatDuration } from '@/features/agenda/duration'
import { LegalMarkdown } from '@/cloud/legal/markdown'
import type { EntryDay, EntryDetail } from '@/cloud/catalog/ports'
import type { Locale } from '@/i18n/config'
import { People } from '../people'
import { AdoptPanel } from '../adopt-panel'

/**
 * One catalogue entry, day by day, before anybody adopts it.
 *
 * The whole point of the screen is that a person sees what they are getting:
 * how many days, what is in them, how long each block runs -- and only then
 * the control that writes it into their workspace. The function behind that
 * control is the same one the MCP tool calls, so that a model never gains a
 * power the interface does not have.
 *
 * ADDRESSED BY ID, never by the slug a public entry also has. A slug is unique
 * per LANGUAGE (`catalog_text_slug_unique`), and the language here comes from
 * the session rather than from the path -- so the same address would open a
 * different entry for a colleague reading in another language, with a 200 and
 * nothing to notice it by. The public pages under /workshop-methods are where
 * slugs belong, because there the language IS the path.
 */
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ entryId: string }> }

async function read({ params }: Props): Promise<EntryDetail> {
  const [{ entryId }, locale] = await Promise.all([params, getLocale() as Promise<Locale>])
  const entry = await catalog.getEntry(entryId, locale)
  // Withdrawn while somebody had the list open is a 404, not an empty page: a
  // soft 404 is how an index fills with addresses that were never real.
  if (!entry) notFound()
  return entry
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  return { title: (await read(props)).name }
}

export default async function EntryPage(props: Props) {
  const [entry, t, library] = await Promise.all([
    read(props),
    getTranslations('discover'),
    // The workshops this person could adopt into. One page of them: the choice
    // is "which of mine", and somebody with three hundred workshops picks the
    // one they just opened, not the two hundredth.
    loadLibrary(),
  ])
  const workshops = library.ok
    ? library.data.workshops.map((workshop) => ({ id: workshop.id, title: workshop.title }))
    : []

  return (
    <div>
      <p className="text-[14px]">
        <Link href={'/discover' as Route} className="underline underline-offset-2">
          {t('back')}
        </Link>
      </p>

      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{entry.name}</h1>
      <p className="mt-2 text-[16px] text-[var(--fg-muted)]">{entry.summary}</p>

      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-[var(--fg-subtle)]">
        <span className="tabular-nums">{t('days', { count: entry.dayCount })}</span>
        <span className="tabular-nums">
          {formatDuration(entry.durationMinutes, { spaced: true })}
        </span>
        <span>
          <People range={entry} />
        </span>
      </p>

      {entry.facets.length > 0 && (
        <p className="mt-3 flex flex-wrap gap-2">
          {entry.facets.map((facet) => (
            <span
              key={`${facet.key}-${facet.label}`}
              className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[13px] text-[var(--fg-muted)]"
            >
              {facet.label}
            </span>
          ))}
        </p>
      )}

      {!entry.translated && (
        <p className="mt-3 text-[13px] text-[var(--fg-subtle)]">{t('untranslated')}</p>
      )}

      {/* The catalogue stores Markdown, and this is the one renderer in the
          tree that turns Markdown into a bounded set of elements. Reused
          rather than reached for a second parser: whatever is safe for a legal
          text is safe for an entry description. */}
      {entry.body && (
        <div className="mt-6">
          <LegalMarkdown source={entry.body} />
        </div>
      )}

      <div className="mt-8">
        <AdoptPanel
          entryId={entry.id}
          // Only a one-day entry may drop into a day that exists. A three-day
          // programme written into one day would lose its structure silently,
          // so the target is not offered rather than refused after the click.
          oneDay={entry.dayCount === 1}
          workshops={workshops}
          labels={{
            title: t('adoptTitle'),
            asNew: t('adoptNew'),
            append: t('adoptAppend'),
            intoDay: t('adoptIntoDay'),
            chooseWorkshop: t('adoptChoose'),
            chooseDay: t('adoptChooseDay'),
            submit: t('adoptSubmit'),
            working: t('adoptWorking'),
            open: t('adoptOpen'),
            noWorkshops: t('adoptNoWorkshops'),
            noDays: t('adoptNoDays'),
          }}
        />
      </div>

      <div className="mt-8">
        {entry.days.map((day, index) => (
          <Day key={`${index}-${day.title}`} day={day} number={index + 1} />
        ))}
      </div>
    </div>
  )
}

async function Day({ day, number }: { day: EntryDay; number: number }) {
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
