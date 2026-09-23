'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import type { Route } from 'next'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers'
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { fromTimeValue, toTimeValue } from '@/features/agenda/duration'
import type { DayNav, DayNavItem } from '@/features/agenda/days'
import { cn } from '@/lib/cn'
import { createDayAction, deleteDayAction, moveDayAction } from '@/server/actions/days'

/** Kept at module level: useSensor memoises on the identity of its options. */
const MOUSE_OPTIONS = { activationConstraint: { distance: 6 } }
// Long-press, so a row of tabs still scrolls under a finger.
const TOUCH_OPTIONS = { activationConstraint: { delay: 200, tolerance: 8 } }

/**
 * The days of a workshop, above the day that is open.
 *
 * A workshop runs over several days, and this row is how somebody gets from one
 * to the next. It is also where a day is added, named, dated, put in order and
 * deleted -- in place, per the rule that editing never happens in a dialog.
 *
 * Reordering has two ways in. Dragging a tab is the accelerator; the arrows
 * next to the open day are the mechanism, because they work under a thumb, from
 * the keyboard and through a screen reader, and a drag is never the only way
 * to do something here.
 *
 * The open day's tab shows the name as it is being typed -- it is read from the
 * shared document, the other tabs from the page. The name "Workshoptag" on the
 * add and delete buttons is deliberate: in German a tag on a workshop is also a
 * "Tag", and both controls sit in the same header.
 */
export function DayTabs({
  nav,
  activeTitle,
  activeDate,
  activeStartMinute,
  onRetitle,
  onRedate,
  onRestart,
}: {
  nav: DayNav
  activeTitle: string
  activeDate: string | null
  /** Minutes since midnight. Read from the shared document, like the name. */
  activeStartMinute: number
  /** Absent where the day's document cannot be written -- readers, and the first paint. */
  onRetitle?: (title: string) => void
  onRedate?: (date: string | null) => void
  onRestart?: (startMinute: number) => void
}) {
  const t = useTranslations('workshop')
  const router = useRouter()

  const [days, setDays] = useState(nav.days)
  // Adopted during render, not in an effect -- see the note in search-box.tsx.
  const [seenDays, setSeenDays] = useState(nav.days)
  if (nav.days !== seenDays) {
    setSeenDays(nav.days)
    setDays(nav.days)
  }

  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()
  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_OPTIONS),
    useSensor(TouchSensor, TOUCH_OPTIONS),
  )

  const manage = nav.canManage
  if (!manage && days.length <= 1) return null

  const activeIndex = days.findIndex((day) => day.id === nav.activeDayId)
  const href = (dayId: string) => `${nav.basePath}${dayId}` as Route
  const labelOf = (day: DayNavItem) =>
    (day.id === nav.activeDayId ? activeTitle : day.title) || t('untitledDay')

  /** Puts a day at `index` of the list without it, and says so to the server. */
  function reorder(dayId: string, index: number) {
    const moving = days.find((day) => day.id === dayId)
    if (!moving) return
    const without = days.filter((day) => day.id !== dayId)
    const afterId = index === 0 ? null : (without[index - 1]?.id ?? null)
    const previous = days

    setDays([...without.slice(0, index), moving, ...without.slice(index)])
    setError(null)
    // Not a transition: the arrows stay live while the answer is on its way,
    // so moving a day two places is two presses rather than a press and a wait.
    void moveDayAction({ workshopId: nav.workshopId, dayId, afterId }).then((result) => {
      if (result.ok) return
      // Put it back rather than leave the tabs claiming an order the server refused.
      setDays(previous)
      setError(result.message)
    })
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    reorder(
      String(active.id),
      days.findIndex((day) => day.id === over.id),
    )
  }

  function addDay() {
    setError(null)
    startTransition(async () => {
      const result = await createDayAction({
        workshopId: nav.workshopId,
        title: t('day.newTitle', { number: days.length + 1 }),
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      router.push(href(result.data.dayId))
    })
  }

  function deleteDay() {
    setError(null)
    startTransition(async () => {
      const result = await deleteDayAction({ workshopId: nav.workshopId, dayId: nav.activeDayId })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setConfirming(false)
      router.push(href(result.data.remainingDayId))
    })
  }

  const tabs = days.map((day) => (
    <DayTab
      key={day.id}
      id={day.id}
      href={href(day.id)}
      label={labelOf(day)}
      current={day.id === nav.activeDayId}
      sortable={manage}
    />
  ))

  return (
    <div className="mb-4 px-4 md:px-2">
      <nav aria-label={t('days')} className="flex flex-wrap items-center gap-1">
        {manage ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToHorizontalAxis]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={days.map((day) => day.id)}
              strategy={horizontalListSortingStrategy}
            >
              {tabs}
            </SortableContext>
          </DndContext>
        ) : (
          tabs
        )}

        {manage && (
          <button
            type="button"
            onClick={addDay}
            disabled={pending}
            aria-label={t('day.add')}
            className="inline-flex items-center gap-1 rounded px-2.5 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)] disabled:opacity-60 pointer-coarse:min-h-11"
          >
            <Plus aria-hidden className="size-4" />
            {t('day.addShort')}
          </button>
        )}
      </nav>

      {manage && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {onRetitle && <DayTitleInput value={activeTitle} onCommit={onRetitle} />}
          {onRedate && (
            <input
              type="date"
              aria-label={t('day.date')}
              value={activeDate ?? ''}
              onChange={(event) => {
                const next = event.target.value || null
                if (next !== activeDate) onRedate(next)
              }}
              className="rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-[14px] text-[var(--fg-muted)] hover:border-[var(--border)] focus:border-[var(--brand-ring)] focus:bg-[var(--surface)] focus:outline-none pointer-coarse:text-[16px]"
            />
          )}

          {onRestart && (
            <input
              type="time"
              aria-label={t('day.start')}
              value={toTimeValue(activeStartMinute)}
              onChange={(event) => {
                const parsed = fromTimeValue(event.target.value)
                // A half-typed time is not a new start time -- and this one is
                // not one block's pin but the hour the whole day hangs off, so
                // an empty box for a moment would move every row on it.
                if (parsed !== null && parsed !== activeStartMinute) onRestart(parsed)
              }}
              className="tabular rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-[14px] text-[var(--fg-muted)] hover:border-[var(--border)] focus:border-[var(--brand-ring)] focus:bg-[var(--surface)] focus:outline-none pointer-coarse:text-[16px]"
            />
          )}

          <span className="inline-flex">
            <IconButton
              label={t('day.moveEarlier')}
              disabled={activeIndex <= 0}
              onClick={() => reorder(nav.activeDayId, activeIndex - 1)}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </IconButton>
            <IconButton
              label={t('day.moveLater')}
              disabled={activeIndex < 0 || activeIndex >= days.length - 1}
              onClick={() => reorder(nav.activeDayId, activeIndex + 1)}
            >
              <ChevronRight aria-hidden className="size-4" />
            </IconButton>
          </span>

          {/* The last day cannot be deleted, so there is nothing to offer. */}
          {days.length > 1 && (
            <button
              type="button"
              onClick={() => setConfirming((open) => !open)}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-[13px] text-[var(--warn-fg)] hover:bg-[var(--surface-raised)] disabled:opacity-60 pointer-coarse:min-h-11"
            >
              <Trash2 aria-hidden className="size-3.5" />
              {t('day.delete')}
            </button>
          )}
        </div>
      )}

      {confirming && (
        <div className="mt-2 rounded border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[14px]">
            {t('day.deleteWarning', { title: activeTitle || t('untitledDay') })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {/* Not the same label as the button that opened this: the second
                one is the one that cannot be taken back. */}
            <button
              type="button"
              onClick={deleteDay}
              disabled={pending}
              className="rounded bg-[var(--danger-fg)] px-3 py-1.5 text-[14px] font-medium text-[var(--bg)] disabled:opacity-50 pointer-coarse:min-h-11"
            >
              {t('day.deleteConfirm')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded px-3 py-1.5 text-[14px] hover:bg-[var(--surface-raised)] pointer-coarse:min-h-11"
            >
              {t('day.cancel')}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[13px] text-[var(--danger-fg)]">
          {error}
        </p>
      )}
    </div>
  )
}

function DayTab({
  id,
  href,
  label,
  current,
  sortable,
}: {
  id: string
  href: Route
  label: string
  current: boolean
  sortable: boolean
}) {
  const className = cn(
    'inline-flex items-center rounded px-2.5 py-1 text-[14px] pointer-coarse:min-h-11',
    current
      ? 'bg-[var(--brand-subtle-bg)] font-medium text-[var(--brand-subtle-fg)]'
      : 'text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]',
  )

  if (!sortable) {
    return (
      <Link href={href} aria-current={current ? 'page' : undefined} className={className}>
        {label}
      </Link>
    )
  }
  return <SortableTab id={id} href={href} label={label} current={current} className={className} />
}

function SortableTab({
  id,
  href,
  label,
  current,
  className,
}: {
  id: string
  href: Route
  label: string
  current: boolean
  className: string
}) {
  // Only the listeners, not dnd-kit's attributes: those would turn the link
  // into a "button" for a screen reader, and the arrows are the keyboard's way
  // of reordering anyway.
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  return (
    <Link
      ref={setNodeRef}
      href={href}
      aria-current={current ? 'page' : undefined}
      className={cn(className, 'touch-manipulation', isDragging && 'opacity-60')}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...listeners}
    >
      {label}
    </Link>
  )
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center justify-center rounded p-1 text-[var(--fg-muted)] hover:bg-[var(--surface-raised)] disabled:opacity-40 pointer-coarse:size-11"
    >
      {children}
    </button>
  )
}

function DayTitleInput({ value, onCommit }: { value: string; onCommit: (value: string) => void }) {
  const t = useTranslations('workshop')
  const [draft, setDraft] = useState(value)
  // Adopted during render, so a name changed by somebody else arrives here too.
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setDraft(value)
  }

  return (
    <input
      type="text"
      aria-label={t('day.title')}
      placeholder={t('untitledDay')}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const next = draft.trim()
        if (next && next !== value) onCommit(next)
        else setDraft(value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') {
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
      className="min-w-0 rounded-sm border border-transparent bg-transparent px-1 py-0.5 text-[15px] font-medium hover:border-[var(--border)] focus:border-[var(--brand-ring)] focus:bg-[var(--surface)] focus:outline-none pointer-coarse:text-[16px]"
    />
  )
}
