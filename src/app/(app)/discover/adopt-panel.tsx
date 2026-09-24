'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adoptEntryAction, loadWorkshopDays } from './actions'

/**
 * The one control that writes: a catalogue entry becomes somebody's agenda.
 *
 * THREE TARGETS, AND THE THIRD IS NOT ALWAYS OFFERED. A whole programme becomes
 * a workshop, or is appended behind the last day of one. A building block --
 * one day, usually one cluster -- can instead fall into a day that already
 * exists, and that is the only case where this writes into something somebody
 * is already using. A three-day entry dropped into one day would lose its
 * structure, so the target is withheld rather than refused after the click.
 *
 * Its labels arrive as props rather than through next-intl. The `discover`
 * namespace is deliberately not in CLIENT_NAMESPACES -- the whole section is
 * server-rendered and this is one of two islands, so shipping a catalogue to
 * the browser for eight sentences would be paying for the wrong thing.
 *
 * Everything here is a string. A label FUNCTION cannot cross into a client
 * component, and React only says so at request time -- see ./entry-view.ts for
 * the afternoon that cost.
 *
 * No dialog. docs/ui-conventions.md reserves those for confirming the
 * irreversible, and adopting is neither irreversible nor a context switch.
 */
export type AdoptLabels = {
  title: string
  asNew: string
  append: string
  intoDay: string
  chooseWorkshop: string
  chooseDay: string
  submit: string
  working: string
  open: string
  noWorkshops: string
  noDays: string
}

/** Already named by the server, unnamed days included -- see loadWorkshopDays. */
type Day = { id: string; label: string }

type Target = 'new' | 'append' | 'day'

export function AdoptPanel({
  entryId,
  oneDay,
  workshops,
  labels,
}: {
  entryId: string
  /** Whether "into a day that exists" is a sensible target for this entry. */
  oneDay: boolean
  workshops: { id: string; title: string }[]
  labels: AdoptLabels
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [target, setTarget] = useState<Target>('new')
  const [workshopId, setWorkshopId] = useState(workshops[0]?.id ?? '')
  // Keyed by the workshop they belong to, so that "still loading" is a
  // comparison rather than a state this effect has to reset on the way in --
  // setting state synchronously inside an effect cascades a render.
  const [days, setDays] = useState<{ workshopId: string; rows: Day[] } | null>(null)
  const [dayId, setDayId] = useState('')
  const [done, setDone] = useState<null | { workshopId: string; notes: string[] }>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (target !== 'day' || !workshopId) return
    let ignore = false
    void loadWorkshopDays(workshopId).then((result) => {
      if (ignore) return
      const rows = result.ok ? result.data : []
      setDays({ workshopId, rows })
      setDayId(rows[0]?.id ?? '')
    })
    return () => {
      ignore = true
    }
  }, [target, workshopId])

  // Null while the chosen workshop's days are still on their way, which is
  // also what it is for the instant after the workshop changes.
  const rows = days?.workshopId === workshopId ? days.rows : null
  const chosenDay = rows?.some((day) => day.id === dayId) ? dayId : ''
  const noDays = target === 'day' && rows !== null && rows.length === 0
  const needsWorkshop = target === 'append' || target === 'day'
  const blocked = (needsWorkshop && workshops.length === 0) || (target === 'day' && !chosenDay)

  const adopt = () =>
    start(async () => {
      setError(null)
      const result = await adoptEntryAction(
        target === 'new'
          ? { entryId, kind: 'new' }
          : target === 'append'
            ? { entryId, kind: 'append', workshopId }
            : { entryId, kind: 'day', workshopId, dayId: chosenDay },
      )
      if (!result.ok) {
        // Already in this person's language -- toResult renders it before it
        // crosses the boundary.
        setError(result.message)
        return
      }
      setDone(result.data)
      router.refresh()
    })

  if (done) {
    return (
      <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-5">
        {/* What did not arrive intact, said plainly. A silent success over an
            entry that lost a third of its blocks is the failure the tallies in
            adopt.ts exist to prevent. */}
        {done.notes.map((note) => (
          <p key={note} className="text-[15px] [&+&]:mt-1">
            {note}
          </p>
        ))}
        <a
          href={`/w/${done.workshopId}`}
          className="mt-3 inline-flex min-h-11 items-center rounded bg-[var(--brand)] px-4 py-3 text-[16px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)]"
        >
          {labels.open}
        </a>
      </div>
    )
  }

  return (
    <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="text-xl font-semibold tracking-tight">{labels.title}</h2>

      <fieldset className="mt-3">
        <legend className="sr-only">{labels.title}</legend>
        <label className="flex min-h-11 items-center gap-2 text-[15px]">
          <input
            type="radio"
            name="adopt-target"
            checked={target === 'new'}
            onChange={() => setTarget('new')}
          />
          {labels.asNew}
        </label>
        <label className="flex min-h-11 items-center gap-2 text-[15px]">
          <input
            type="radio"
            name="adopt-target"
            checked={target === 'append'}
            disabled={workshops.length === 0}
            onChange={() => setTarget('append')}
          />
          {labels.append}
        </label>
        {oneDay && (
          <label className="flex min-h-11 items-center gap-2 text-[15px]">
            <input
              type="radio"
              name="adopt-target"
              checked={target === 'day'}
              disabled={workshops.length === 0}
              onChange={() => setTarget('day')}
            />
            {labels.intoDay}
          </label>
        )}
      </fieldset>

      {needsWorkshop &&
        (workshops.length === 0 ? (
          <p className="mt-3 text-[15px] text-[var(--fg-muted)]">{labels.noWorkshops}</p>
        ) : (
          <div className="mt-3 flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-[14px] text-[var(--fg-subtle)]">
              {labels.chooseWorkshop}
              <select
                value={workshopId}
                onChange={(event) => setWorkshopId(event.target.value)}
                // 16px, or iOS zooms the page on focus -- ui-conventions.md.
                className="min-h-11 w-64 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-[16px]"
              >
                {workshops.map((workshop) => (
                  <option key={workshop.id} value={workshop.id}>
                    {workshop.title}
                  </option>
                ))}
              </select>
            </label>

            {target === 'day' && (
              <label className="flex flex-col gap-1 text-[14px] text-[var(--fg-subtle)]">
                {labels.chooseDay}
                <select
                  value={chosenDay}
                  disabled={rows === null || rows.length === 0}
                  onChange={(event) => setDayId(event.target.value)}
                  className="min-h-11 w-56 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-[16px] disabled:opacity-60"
                >
                  {(rows ?? []).map((day) => (
                    <option key={day.id} value={day.id}>
                      {day.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        ))}

      {noDays && <p className="mt-2 text-[15px] text-[var(--fg-muted)]">{labels.noDays}</p>}

      {error && (
        <p role="alert" className="mt-3 text-[15px] text-[var(--danger-fg)]">
          {error}
        </p>
      )}

      <p className="mt-4">
        <button
          type="button"
          onClick={adopt}
          disabled={pending || blocked}
          className="inline-flex min-h-11 items-center rounded bg-[var(--brand)] px-4 py-3 text-[16px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60"
        >
          {pending ? labels.working : labels.submit}
        </button>
      </p>
    </div>
  )
}
