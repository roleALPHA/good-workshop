'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { ChevronRight, FolderIcon, FolderInput, Users, X } from 'lucide-react'
import { deleteFolderAction, moveFolderAction } from '@/server/actions/workshop'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { DropTarget, MoveControl } from './drag-parts'
import { useLibraryDrag } from './library-dnd'

/**
 * A folder in the sidebar, with a way to remove it.
 *
 * Deleting a folder is a decision about ORDER, not about content: what is
 * inside moves up one level rather than going with it. That is why there is no
 * dire warning here -- nothing is lost, and the label says where things end up.
 *
 * It takes drops from everybody and is dragged only by an admin: filing one's
 * own workshop needs no special standing, rearranging the tenant's folders does.
 */
export function FolderRow({
  id,
  name,
  parentId,
  depth,
  active,
  canManage,
  draggable = true,
  foldable = false,
  folded = false,
  onToggleFold,
  /** Every folder this one may move into: itself and its own subtree excluded. */
  targets,
}: {
  id: string
  name: string
  parentId: string | null
  depth: number
  active: boolean
  canManage: boolean
  /** It has subfolders, so it can be folded. */
  foldable?: boolean
  folded?: boolean
  onToggleFold?: () => void
  /** False while the tree is filtered: the button then only opens the select. */
  draggable?: boolean
  targets: { id: string; name: string; depth: number }[]
}) {
  const t = useTranslations('library')
  const { active: dragging, projection, overId, pendingId } = useLibraryDrag()

  const [pending, startTransition] = useTransition()
  const [failed, setFailed] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)

  function remove() {
    setFailed(null)
    startTransition(async () => {
      const result = await deleteFolderAction({ id })
      if (!result.ok) setFailed(result.message)
    })
  }

  function move(nextParentId: string | null) {
    setFailed(null)
    setMoving(false)
    startTransition(async () => {
      const result = await moveFolderAction({ id, parentId: nextParentId })
      if (!result.ok) setFailed(result.message)
    })
  }

  // A workshop is aimed at one row; a folder is aimed between rows, and the row
  // it would land under is highlighted. No line for the slot among siblings:
  // they are alphabetical, so the folder takes its place by name.
  const takesWorkshop = dragging?.kind === 'workshop' && overId === id
  const becomesParent =
    dragging?.kind === 'folder' && projection?.valid === true && projection.parentId === id

  return (
    <DropTarget id={id}>
      {({ ref }) => (
        <li ref={ref} className="relative" style={{ paddingLeft: depth * 12 }}>
          <div
            className={cn(
              'group relative flex items-center gap-1 rounded',
              (takesWorkshop || becomesParent) &&
                'bg-[var(--brand-subtle-bg)] ring-2 ring-[var(--brand-ring)] ring-inset',
              pendingId === id && 'opacity-60',
            )}
          >
            {/* A spacer where there is nothing to fold, so every name starts at
                the same place for its depth. */}
            {foldable ? (
              <button
                type="button"
                onClick={onToggleFold}
                aria-expanded={!folded}
                aria-label={folded ? t('expandFolder', { name }) : t('collapseFolder', { name })}
                className={cn(foldClass, 'hover:bg-[var(--surface-raised)]')}
              >
                <ChevronRight
                  aria-hidden
                  className={cn(
                    'size-3.5 transition-transform motion-reduce:transition-none',
                    !folded && 'rotate-90',
                  )}
                />
              </button>
            ) : (
              <span aria-hidden className={foldClass} />
            )}

            <Link
              href={`/library?folder=${id}`}
              // A drop that lands on a link would otherwise navigate as well.
              onClickCapture={(event) => {
                if (dragging) event.preventDefault()
              }}
              className={cn(
                'inline-flex min-w-0 flex-1 items-center gap-1.5 rounded px-2 py-1 text-[15px]',
                active
                  ? 'bg-[var(--surface-raised)] font-medium'
                  : 'text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]',
              )}
            >
              <FolderIcon aria-hidden className="size-3.5 shrink-0" />
              {/* The whole name on hover, for the ones that still do not fit. */}
              <span className="truncate" title={name}>
                {name}
              </span>
            </Link>

            <div className={actionsClass}>
              {/* Not behind `canManage`: a folder viewer may look at who else has
                  access even though they can change little or nothing. The page
                  itself decides what the select offers -- see folder-sharing. */}
              <Link
                href={`/f/${id}/sharing`}
                title={t('folderShare')}
                aria-label={t('folderShareOf', { name })}
                className={iconButtonClass}
              >
                <Users aria-hidden className="size-3.5" />
              </Link>

              {canManage && (
                <MoveControl
                  drag={{ kind: 'folder', id, name }}
                  draggable={draggable}
                  expanded={moving}
                  onToggle={() => setMoving((open) => !open)}
                  label={t('moveFolderLabel', { name })}
                  hint={t('moveFolderHint')}
                  className={iconButtonClass}
                >
                  <FolderInput aria-hidden className="size-3.5" />
                </MoveControl>
              )}

              {canManage && (
                <button
                  type="button"
                  onClick={remove}
                  disabled={pending}
                  title={t('removeFolder')}
                  aria-label={t('removeFolderLabel', { name })}
                  className={iconButtonClass}
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {moving && (
            <div className="mt-1 ml-2">
              <label htmlFor={`move-${id}`} className="text-[12px] text-[var(--fg-subtle)]">
                {t('moveTo')}
              </label>
              <select
                id={`move-${id}`}
                defaultValue={parentId ?? ''}
                disabled={pending}
                onChange={(event) => move(event.target.value === '' ? null : event.target.value)}
                className="mt-0.5 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-2 text-[16px]"
              >
                <option value="">{t('topLevel')}</option>
                {targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {' '.repeat(target.depth * 2)}
                    {target.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {failed && (
            <p role="alert" className="px-2 text-[13px] text-[var(--warn-fg)]">
              {failed}
            </p>
          )}
        </li>
      )}
    </DropTarget>
  )
}

/**
 * The row's buttons: visible on hover, on focus anywhere in the row, and always
 * under a thumb.
 *
 * Laid OVER the end of the name rather than beside it. Hidden but still in the
 * flow, three buttons took 100px of a 200px sidebar, and a folder name was cut
 * after five letters whether anybody was pointing at it or not. Now the name
 * has the row until somebody reaches for the buttons.
 *
 * Hidden by opacity alone, deliberately not by `pointer-events-none`. A pointer
 * cannot reach the buttons without hovering the row, which shows them first, so
 * nobody clicks one they could not see. And opacity keeps them in the tab order
 * and hit-testable -- focus is what reveals the bar for a keyboard, and the
 * library's end-to-end tests aim at these buttons by name.
 *
 * On a coarse pointer there is no hover to reveal anything with, so the bar
 * goes back into the flow, always visible -- the name yields there, as before.
 */
const actionsClass = cn(
  'absolute inset-y-0 right-0 flex items-center gap-1 rounded bg-[var(--bg)] pl-1',
  'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
  'pointer-coarse:static pointer-coarse:opacity-100',
)

/**
 * The fold toggle, and the spacer that stands in for it.
 *
 * Small on a mouse, where it sits in a 200px sidebar next to the indent. Larger
 * under a thumb, though not the full 44px: the row's own buttons already take
 * that, and a second one per row would leave no room for the name.
 */
const foldClass = cn(
  'grid size-5 shrink-0 place-items-center rounded text-[var(--fg-subtle)]',
  'pointer-coarse:size-8',
)

/**
 * These were `p-1` around a 3.5 icon -- about 22px, half the floor for
 * something meant to be tapped. The 44px goes on coarse pointers only, where it
 * is a touch target rather than wasted height.
 */
const iconButtonClass = cn(
  'grid size-8 shrink-0 place-items-center rounded text-[var(--fg-subtle)]',
  'pointer-coarse:size-11',
  'hover:bg-[var(--surface-raised)] disabled:opacity-40',
)
