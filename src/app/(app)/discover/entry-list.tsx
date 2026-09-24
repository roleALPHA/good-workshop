'use client'

import Link from 'next/link'
import type { Route } from 'next'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTransition } from 'react'
import type { SearchParams } from '@/cloud/catalog/query'
import { loadEntriesAction } from './actions'
import type { EntryView } from './entry-view'

/**
 * The mixed list, one page at a time.
 *
 * The only island on this screen, and it exists for one reason: the next page
 * has to arrive without a navigation. Everything that decides WHAT is in the
 * list -- the filters -- stays in the address and stays on the
 * server, so the first page, the filters and every link still work before this
 * component has hydrated.
 *
 * "Load more" stays under the list next to the observer. docs/ui-conventions.md
 * is explicit that a pointer gesture is never the only way to do something: the
 * button is how a keyboard and a screen reader reach page two, and what is left
 * in a browser without IntersectionObserver.
 *
 * EVERY ROW ARRIVES ALREADY WORDED, as an `EntryView`. Handing this component
 * an entry plus a set of label FUNCTIONS is what it did first, and React
 * refuses a function across the boundary -- at request time, so the typecheck,
 * the lint run and the unit suite all stay green while the page throws. The
 * only props left are strings, which is a shape that cannot repeat the mistake.
 *
 * That also keeps every translation on the server, which is why `discover` can
 * stay out of CLIENT_NAMESPACES -- see adopt-panel.tsx for the same decision.
 */
export type EntryLabels = {
  more: string
  loading: string
  failed: string
}

export function EntryList({
  initial,
  initialCursor,
  params,
  labels,
}: {
  initial: EntryView[]
  initialCursor: string | null
  /** The address as it stands, re-parsed on the server for every later page. */
  params: SearchParams
  labels: EntryLabels
}) {
  const [entries, setEntries] = useState(initial)
  const [cursor, setCursor] = useState(initialCursor)
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  // A ref, not `pending`: the observer fires again for every scroll that keeps
  // the end in view, and the transition's state has not reached this closure
  // by then. The same page twice would put every row in the list twice.
  const loading = useRef(false)
  const more = useCallback(() => {
    if (!cursor || loading.current) return
    loading.current = true
    startTransition(async () => {
      try {
        const result = await loadEntriesAction(params, cursor)
        if (!result.ok) {
          setFailed(true)
          return
        }
        setEntries((current) => [...current, ...result.data.items])
        setCursor(result.data.nextCursor)
      } finally {
        loading.current = false
      }
    })
  }, [cursor, params])

  /**
   * A marker under the last row, watched with a margin so the next page is on
   * its way before the end is actually reached. Rebuilt whenever the cursor
   * changes: a new observer reports at once, so a page too short to push the
   * marker out of view pulls the next one rather than waiting for a scroll
   * that cannot happen.
   */
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const target = end.current
    if (!cursor || !target || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (items) => {
        if (items.some((item) => item.isIntersecting)) more()
      },
      { rootMargin: '0px 0px 400px 0px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [cursor, more])

  return (
    <>
      <ul className="mt-8 divide-y divide-[var(--border)] rounded border border-[var(--border)]">
        {entries.map((entry) => (
          <EntryRow key={entry.id} entry={entry} />
        ))}
      </ul>

      {failed && (
        <p role="alert" className="mt-2 text-[14px] text-[var(--warn-fg)]">
          {labels.failed}
        </p>
      )}

      {cursor && (
        <>
          <div ref={end} aria-hidden className="h-px" />
          <button
            type="button"
            onClick={more}
            disabled={pending}
            className="mt-3 min-h-11 w-full rounded border border-[var(--border-strong)] px-3 py-2 text-[15px] hover:bg-[var(--surface-raised)] disabled:opacity-60"
          >
            {pending ? labels.loading : labels.more}
          </button>
        </>
      )}
    </>
  )
}

function EntryRow({ entry }: { entry: EntryView }) {
  return (
    <li className="p-4">
      <p>
        <Link
          href={entry.href as Route}
          className="text-[17px] font-medium underline-offset-2 hover:underline"
        >
          {entry.name}
        </Link>
      </p>

      <p className="mt-1 max-w-2xl text-[15px] text-[var(--fg-muted)]">{entry.summary}</p>

      <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-[var(--fg-subtle)]">
        {/* tabular-nums, so a column of durations lines up -- ui-conventions.md */}
        {entry.meta.map((said) => (
          <span key={said} className="tabular-nums">
            {said}
          </span>
        ))}
      </p>

      {entry.facets.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-2">
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

      {/* Said rather than hidden: the same choice the legal pages make when a
          translation is missing. */}
      {entry.untranslated && (
        <p className="mt-2 text-[13px] text-[var(--fg-subtle)]">{entry.untranslated}</p>
      )}
    </li>
  )
}
