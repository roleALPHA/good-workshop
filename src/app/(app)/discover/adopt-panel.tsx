'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adoptDesignAction } from './actions'

/**
 * The one control that writes: a design becomes a workshop.
 *
 * Its labels arrive as props rather than through next-intl. The `discover`
 * namespace is deliberately not in CLIENT_NAMESPACES -- the whole section is
 * server-rendered and this is its only island, so shipping a catalogue to the
 * browser for six sentences would be paying for the wrong thing.
 *
 * No dialog. docs/ui-conventions.md reserves those for confirming the
 * irreversible, and adopting is neither irreversible nor a context switch: it
 * makes a workshop somebody can delete like any other.
 *
 * THE SHORTFALL LINES ARRIVE ALREADY WORDED, in `notes`. They used to be label
 * functions taking a count, and React refuses a function across the boundary:
 * the page threw at request time while the typecheck, the lint run and the
 * unit suite stayed green. Nothing here takes an argument any more, which is a
 * shape that cannot repeat it.
 */
export type AdoptLabels = {
  title: string
  asNew: string
  append: string
  choose: string
  submit: string
  working: string
  open: string
  noWorkshops: string
}

export function AdoptPanel({
  designId,
  workshops,
  labels,
}: {
  designId: string
  workshops: { id: string; title: string }[]
  labels: AdoptLabels
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [target, setTarget] = useState<'new' | 'append'>('new')
  const [workshopId, setWorkshopId] = useState(workshops[0]?.id ?? '')
  const [done, setDone] = useState<null | { workshopId: string; notes: string[] }>(null)
  const [error, setError] = useState<string | null>(null)

  const adopt = () =>
    start(async () => {
      setError(null)
      const result = await adoptDesignAction(
        target === 'new' ? { designId, kind: 'new' } : { designId, kind: 'append', workshopId },
      )
      if (!result.ok) {
        // The message is already in this person's language -- toResult renders
        // it before it crosses the boundary.
        setError(result.message)
        return
      }
      setDone(result.data)
      router.refresh()
    })

  if (done) {
    return (
      <div className="rounded border border-[var(--border)] bg-[var(--surface)] p-5">
        {/* What did not arrive intact, said plainly. A silent success over a
            design that lost a third of its blocks is the failure the tallies
            in adopt.ts exist to prevent. */}
        {done.notes.map((note) => (
          <p key={note} className="text-[15px] first:mt-0 [&+&]:mt-1">
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
            name="target"
            checked={target === 'new'}
            onChange={() => setTarget('new')}
          />
          {labels.asNew}
        </label>
        <label className="flex min-h-11 items-center gap-2 text-[15px]">
          <input
            type="radio"
            name="target"
            checked={target === 'append'}
            disabled={workshops.length === 0}
            onChange={() => setTarget('append')}
          />
          {labels.append}
        </label>
      </fieldset>

      {target === 'append' &&
        (workshops.length === 0 ? (
          <p className="mt-2 text-[14px] text-[var(--fg-subtle)]">{labels.noWorkshops}</p>
        ) : (
          <label className="mt-2 flex flex-col gap-1 text-[14px] text-[var(--fg-subtle)]">
            {labels.choose}
            <select
              value={workshopId}
              onChange={(event) => setWorkshopId(event.target.value)}
              className="min-h-11 rounded border border-[var(--border)] bg-[var(--surface)] px-2 text-[16px]"
            >
              {workshops.map((workshop) => (
                <option key={workshop.id} value={workshop.id}>
                  {workshop.title}
                </option>
              ))}
            </select>
          </label>
        ))}

      {error && <p className="mt-3 text-[15px] text-[var(--danger-fg)]">{error}</p>}

      <button
        type="button"
        onClick={adopt}
        disabled={pending || (target === 'append' && workshops.length === 0)}
        className="mt-4 min-h-11 rounded bg-[var(--brand)] px-4 py-3 text-[16px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60"
      >
        {pending ? labels.working : labels.submit}
      </button>
    </div>
  )
}
