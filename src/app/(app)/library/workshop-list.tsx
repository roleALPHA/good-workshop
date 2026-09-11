'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import type { WorkshopSummary } from '@/domain/workshop/repo'
import { Trash2 } from 'lucide-react'
import { loadLibrary, trashWorkshopAction } from '@/server/actions/workshop'

const STATUS: Record<string, string> = {
  draft: 'Entwurf',
  ready: 'Bereit',
  delivered: 'Durchgeführt',
  archived: 'Archiviert',
}

/**
 * The list, one page at a time.
 *
 * "Load more" rather than infinite scroll: a workshop library is something
 * people search and return to, and a list that grows as you scroll has no
 * bottom to reach and no position to come back to.
 */
export function WorkshopList({
  initial,
  initialCursor,
  query,
  filtered,
}: {
  initial: WorkshopSummary[]
  initialCursor: string | null
  query: { folderId: string | null; tagId?: string; search?: string }
  filtered: boolean
}) {
  const [workshops, setWorkshops] = useState(initial)
  const [cursor, setCursor] = useState(initialCursor)
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState<string | null>(null)

  /**
   * Removed from the list straight away, and undoable from the bin.
   *
   * No confirmation dialog: the workshop is recoverable for as long as somebody
   * wants it, so asking "are you sure" every time would train people to click
   * through the one dialog that matters -- the one in the bin, where it really
   * ends.
   */
  function trash(id: string, title: string) {
    setFailed(null)
    startTransition(async () => {
      const result = await trashWorkshopAction({ workshopId: id })
      if (!result.ok) {
        setFailed(`${title}: ${result.message}`)
        return
      }
      setWorkshops((current) => current.filter((row) => row.id !== id))
    })
  }

  // The server re-renders this component with fresh props when the URL
  // changes, but React keeps the state of a component it is reusing -- so the
  // page identity has to be part of the key. It is, one level up.
  function more() {
    startTransition(async () => {
      const result = await loadLibrary({ ...query, cursor: cursor ?? undefined })
      if (!result.ok) return
      setWorkshops((current) => [...current, ...result.data.workshops])
      setCursor(result.data.nextCursor)
    })
  }

  if (workshops.length === 0) {
    return (
      <div className="rounded border border-dashed border-[var(--border-strong)] px-6 py-10 text-center">
        <p className="font-medium">{filtered ? 'Nichts gefunden.' : 'Noch kein Workshop hier.'}</p>
        <p className="mt-1 text-[15px] text-[var(--fg-muted)]">
          {filtered
            ? 'Andere Suche, anderer Ordner oder anderes Tag.'
            : 'Leg einen an — der erste Tag ist gleich mit dabei.'}
        </p>
      </div>
    )
  }

  return (
    <>
      <ul className="divide-y divide-[var(--border)] rounded border border-[var(--border)]">
        {workshops.map((workshop) => (
          <li key={workshop.id}>
            <Link
              href={`/w/${workshop.id}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3 hover:bg-[var(--surface-raised)]"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{workshop.title}</span>

              {workshop.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="shrink-0 rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[13px] text-[var(--fg-muted)]"
                >
                  {tag.name}
                </span>
              ))}

              <span className="tabular shrink-0 text-[14px] text-[var(--fg-muted)]">
                {workshop.dayCount} {workshop.dayCount === 1 ? 'Tag' : 'Tage'}
              </span>
              <span className="shrink-0 rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[13px] text-[var(--fg-muted)]">
                {STATUS[workshop.status] ?? workshop.status}
              </span>
            </Link>

            {/* Outside the Link, not inside it: a button nested in an anchor is
                invalid markup, and the click would navigate as well as delete. */}
            <div className="flex items-center justify-end px-4 pb-2">
              <button
                type="button"
                onClick={() => trash(workshop.id, workshop.title)}
                disabled={pending}
                aria-label={`${workshop.title} in den Papierkorb`}
                className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[13px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)] disabled:opacity-60"
              >
                <Trash2 aria-hidden className="size-3.5" />
                In den Papierkorb
              </button>
            </div>
          </li>
        ))}
      </ul>

      {failed && (
        <p role="alert" className="mt-2 text-[14px] text-[var(--warn-fg)]">
          {failed}
        </p>
      )}

      {cursor && (
        <button
          type="button"
          onClick={more}
          disabled={pending}
          className="mt-3 w-full rounded border border-[var(--border-strong)] px-3 py-2 text-[15px] hover:bg-[var(--surface-raised)] disabled:opacity-60"
        >
          {pending ? 'Lädt …' : 'Mehr laden'}
        </button>
      )}
    </>
  )
}
