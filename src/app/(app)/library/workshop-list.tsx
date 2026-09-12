'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, useTransition } from 'react'
import type { WorkshopSummary } from '@/domain/workshop/repo'
import { FolderInput, Trash2 } from 'lucide-react'
import { loadLibrary, moveWorkshopAction, trashWorkshopAction } from '@/server/actions/workshop'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { MoveControl } from './drag-parts'
import { useLibraryDrag } from './library-dnd'

export type FolderChoice = { id: string; name: string; depth: number }

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
  folders,
}: {
  initial: WorkshopSummary[]
  initialCursor: string | null
  /** `folderId` absent means no folder filter; null means the top level only. */
  query: { folderId?: string | null; tagId?: string; search?: string }
  filtered: boolean
  folders: FolderChoice[]
}) {
  const t = useTranslations('library')
  const tc = useTranslations('common')
  const tStatus = useTranslations('enums.workshopStatus')
  const { announce, describeWhere, setWorkshopMover } = useLibraryDrag()
  const [workshops, setWorkshops] = useState(initial)
  const [cursor, setCursor] = useState(initialCursor)
  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null)

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

  /**
   * Files a workshop, and shows it where the list can.
   *
   * Whether the row stays is a question about the filter, not about the move:
   * in the whole library it stays and its folder chip changes, but in a list
   * showing one folder a workshop that has left it must go, or it sits there
   * claiming a place it no longer has. The server revalidation cannot do this
   * -- the rows live in state here and the component is not remounted until the
   * filter itself changes.
   *
   * And no `router.refresh()` afterwards: nothing that is server-rendered
   * depends on where a workshop sits. The sidebar lists folders without counts,
   * the tag counts do not move, and the list itself is this state. Re-rendering
   * the whole route would be work nobody can see.
   */
  const move = useCallback(
    (id: string, title: string, folderId: string | null) => {
      setFailed(null)
      setMoving(null)
      startTransition(async () => {
        const result = await moveWorkshopAction({ workshopId: id, folderId })
        if (!result.ok) {
          setFailed(`${title}: ${result.message}`)
          announce(result.message)
          return
        }

        const leavesTheList = query.folderId !== undefined && query.folderId !== folderId
        setWorkshops((current) =>
          leavesTheList
            ? current.filter((row) => row.id !== id)
            : current.map((row) => (row.id === id ? { ...row, folderId } : row)),
        )
        announce(t('drag.dropped', { title, where: describeWhere(folderId) }))
      })
    },
    [announce, describeWhere, query.folderId, t],
  )

  // A drop is not a second way to move a workshop: it reaches this same
  // function, so the row's folder stays true and the next drop compares
  // against something real.
  useEffect(() => {
    setWorkshopMover(move)
    return () => setWorkshopMover(null)
  }, [move, setWorkshopMover])

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
        <p className="font-medium">{filtered ? t('emptyFiltered') : t('empty')}</p>
        <p className="mt-1 text-[15px] text-[var(--fg-muted)]">
          {filtered ? t('emptyFilteredHint') : t('emptyHint')}
        </p>
      </div>
    )
  }

  return (
    <>
      <ul className="divide-y divide-[var(--border)] rounded border border-[var(--border)]">
        {workshops.map((workshop) => {
          // A viewer has no workshop.update, so the server would refuse this
          // anyway -- and a control that always fails is worse than none.
          const canMove = workshop.role !== 'viewer'
          const folderName = folders.find((node) => node.id === workshop.folderId)?.name

          return (
            <li key={workshop.id} className="group">
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
                  {t('dayCount', { count: workshop.dayCount })}
                </span>
                <span className="shrink-0 rounded bg-[var(--surface-raised)] px-1.5 py-0.5 text-[13px] text-[var(--fg-muted)]">
                  {tStatus(workshop.status)}
                </span>
              </Link>

              {/* Outside the Link, not inside it: a button nested in an anchor is
                  invalid markup, and the click would navigate as well as delete. */}
              <div className="flex flex-wrap items-center justify-end gap-x-2 px-4 pb-2">
                {/* Where it sits, said in the row.
                    Without it, filing a workshop in the unfiltered library
                    changes nothing anybody can see: the row stays, nothing
                    moves, and the only feedback is a live region. */}
                <span className="mr-auto inline-flex min-w-0 items-center gap-1 text-[13px] text-[var(--fg-subtle)]">
                  <FolderInput aria-hidden className="size-3.5 shrink-0" />
                  <span className="truncate">{folderName ?? t('noFolder')}</span>
                </span>

                {canMove && (
                  <MoveControl
                    drag={{
                      kind: 'workshop',
                      id: workshop.id,
                      title: workshop.title,
                      folderId: workshop.folderId,
                    }}
                    expanded={moving === workshop.id}
                    onToggle={() =>
                      setMoving((open) => (open === workshop.id ? null : workshop.id))
                    }
                    disabled={pending}
                    label={t('moveWorkshopLabel', { title: workshop.title })}
                    hint={t('moveWorkshopHint')}
                    className={actionClass}
                  >
                    <FolderInput aria-hidden className="size-4" />
                    <span className="hidden sm:inline">{t('moveTo')}</span>
                  </MoveControl>
                )}

                <button
                  type="button"
                  onClick={() => trash(workshop.id, workshop.title)}
                  disabled={pending}
                  title={t('moveToTrash')}
                  aria-label={t('moveToTrashLabel', { title: workshop.title })}
                  className={actionClass}
                >
                  <Trash2 aria-hidden className="size-4" />
                  <span className="hidden sm:inline">{t('moveToTrash')}</span>
                </button>
              </div>

              {moving === workshop.id && (
                <div className="px-4 pb-3">
                  <label
                    htmlFor={`move-workshop-${workshop.id}`}
                    className="text-[12px] text-[var(--fg-subtle)]"
                  >
                    {t('moveTo')}
                  </label>
                  <select
                    id={`move-workshop-${workshop.id}`}
                    defaultValue={workshop.folderId ?? ''}
                    disabled={pending}
                    onChange={(event) =>
                      move(workshop.id, workshop.title, event.target.value || null)
                    }
                    className="mt-0.5 block w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-[16px]"
                  >
                    <option value="">{t('topLevel')}</option>
                    {folders.map((node) => (
                      <option key={node.id} value={node.id}>
                        {' '.repeat(node.depth * 2)}
                        {node.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </li>
          )
        })}
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
          {pending ? tc('loading') : tc('loadMore')}
        </button>
      )}
    </>
  )
}

/**
 * Icon-only until there is room for words, and 44px only under a thumb.
 *
 * Two labelled buttons side by side do not fit across 375px, and wrapping them
 * turned every row into three lines of chrome under one title. The name does
 * not go missing: it is on the button as its accessible name either way.
 *
 * `pointer-coarse:` rather than always: a 44px box around one line of 13px text
 * is not a touch target under a mouse, it is wasted row height.
 */
const actionClass = cn(
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-[13px]',
  'pointer-coarse:min-h-11 pointer-coarse:min-w-11',
  'text-[var(--fg-muted)] hover:bg-[var(--surface-raised)] disabled:opacity-60',
)
