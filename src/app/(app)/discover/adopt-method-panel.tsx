'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adoptMethodAction, loadWorkshopDays } from './actions'

/**
 * The control that puts one method into one day.
 *
 * Its labels arrive as props, like ./adopt-panel.tsx next door and for the
 * same reason: the `discover` namespace is deliberately not in
 * CLIENT_NAMESPACES, and shipping a catalogue to the browser for eight
 * sentences would be paying for the wrong thing.
 *
 * TWO PICKERS AND NOT ONE, because a method is a block and a block lives on a
 * day. Guessing the last day would be right until somebody plans a second one,
 * and then wrong in a way they only notice after looking for the block. The
 * days load when a workshop is chosen rather than all of them up front: a
 * library of three hundred workshops would otherwise be three hundred queries
 * for the one the person picks.
 *
 * No dialog -- docs/ui-conventions.md reserves those for confirming the
 * irreversible, and this makes a block anybody can delete.
 */
export type AdoptMethodLabels = {
  title: string
  asNew: string
  intoDay: string
  chooseWorkshop: string
  chooseDay: string
  submit: string
  working: string
  open: string
  noWorkshops: string
  noDays: string
  degraded: string
  dropped: string
}

/** Already named by the server, unnamed days included -- see loadWorkshopDays. */
type Day = { id: string; label: string }

export function AdoptMethodPanel({
  methodId,
  workshops,
  labels,
}: {
  methodId: string
  workshops: { id: string; title: string }[]
  labels: AdoptMethodLabels
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [target, setTarget] = useState<'new' | 'day'>(workshops.length > 0 ? 'day' : 'new')
  const [workshopId, setWorkshopId] = useState(workshops[0]?.id ?? '')
  // Keyed by the workshop they belong to, so that "still loading" is a
  // comparison rather than a state this effect has to reset on the way in --
  // setting state synchronously inside an effect cascades a render, and the
  // lint rule that says so is right.
  const [days, setDays] = useState<{ workshopId: string; rows: Day[] } | null>(null)
  const [dayId, setDayId] = useState('')
  const [done, setDone] = useState<null | {
    workshopId: string
    degraded: number
    descDropped: number
  }>(null)
  const [error, setError] = useState<string | null>(null)

  // The chosen workshop's days, fetched when it changes. `ignore` is the usual
  // guard: two quick changes must not let the slower answer win.
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

  const adopt = () =>
    start(async () => {
      setError(null)
      const result = await adoptMethodAction(
        target === 'new'
          ? { methodId, kind: 'new' }
          : { methodId, kind: 'day', workshopId, dayId: chosenDay },
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
      <section className="rounded border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-[17px] font-medium">{labels.title}</h2>
        {done.degraded > 0 && (
          <p className="mt-2 text-[15px] text-[var(--fg-muted)]">{labels.degraded}</p>
        )}
        {done.descDropped > 0 && (
          <p className="mt-2 text-[15px] text-[var(--fg-muted)]">{labels.dropped}</p>
        )}
        <p className="mt-3">
          <a
            href={`/w/${done.workshopId}`}
            className="inline-flex min-h-11 items-center rounded border border-[var(--border-strong)] px-4 text-[15px] hover:bg-[var(--surface-raised)]"
          >
            {labels.open}
          </a>
        </p>
      </section>
    )
  }

  // Null while the chosen workshop's days are still on their way, which is
  // also what it is for the instant after the workshop changes.
  const rows = days?.workshopId === workshopId ? days.rows : null
  const chosenDay = rows?.some((day) => day.id === dayId) ? dayId : ''
  const noDays = target === 'day' && rows !== null && rows.length === 0
  const blocked = target === 'day' && (workshops.length === 0 || !chosenDay)

  return (
    <section className="rounded border border-[var(--border)] bg-[var(--surface)] p-5">
      <h2 className="text-[17px] font-medium">{labels.title}</h2>

      <fieldset className="mt-3">
        <legend className="sr-only">{labels.title}</legend>
        <label className="flex min-h-11 items-center gap-2 text-[15px]">
          <input
            type="radio"
            name="adopt-method-target"
            checked={target === 'day'}
            disabled={workshops.length === 0}
            onChange={() => setTarget('day')}
          />
          {labels.intoDay}
        </label>
        <label className="flex min-h-11 items-center gap-2 text-[15px]">
          <input
            type="radio"
            name="adopt-method-target"
            checked={target === 'new'}
            onChange={() => setTarget('new')}
          />
          {labels.asNew}
        </label>
      </fieldset>

      {target === 'day' &&
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
          className="inline-flex min-h-11 items-center rounded border border-[var(--border-strong)] bg-[var(--brand)] px-4 text-[15px] text-[var(--brand-fg)] disabled:opacity-60"
        >
          {pending ? labels.working : labels.submit}
        </button>
      </p>
    </section>
  )
}
