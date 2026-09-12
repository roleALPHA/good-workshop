'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { FolderIcon, FolderInput, X } from 'lucide-react'
import { deleteFolderAction, moveFolderAction } from '@/server/actions/workshop'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/cn'
import { DropTarget, MoveControl } from './drag-parts'
import { InsertionLine } from './folder-tree'
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
  /** Every folder this one may move into: itself and its own subtree excluded. */
  targets,
}: {
  id: string
  name: string
  parentId: string | null
  depth: number
  active: boolean
  canManage: boolean
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

  // A workshop is aimed at one row; a folder is aimed between rows, so the row
  // it would land under is highlighted and a line marks the slot.
  const takesWorkshop = dragging?.kind === 'workshop' && overId === id
  const becomesParent =
    dragging?.kind === 'folder' && projection?.valid === true && projection.parentId === id
  const lineBelow =
    dragging?.kind === 'folder' && projection?.valid === true && projection.afterId === id

  return (
    <DropTarget id={id}>
      {({ ref }) => (
        <li ref={ref} className="relative" style={{ paddingLeft: depth * 12 }}>
          <div
            className={cn(
              'group flex items-center gap-1 rounded',
              (takesWorkshop || becomesParent) &&
                'bg-[var(--brand-subtle-bg)] ring-2 ring-[var(--brand-ring)] ring-inset',
              pendingId === id && 'opacity-60',
            )}
          >
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
              <span className="truncate">{name}</span>
            </Link>

            {canManage && (
              <MoveControl
                drag={{ kind: 'folder', id, name }}
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

          {lineBelow && <InsertionLine depth={projection.depth} />}

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
 * Visible on hover, on focus anywhere in the row, and always under a thumb.
 *
 * These were `p-1` around a 3.5 icon -- about 22px, half the floor for
 * something meant to be tapped. The 44px goes on coarse pointers only, where it
 * is a touch target rather than wasted height, and so does the visibility:
 * there is no hover to reveal them with on a touch screen.
 */
const iconButtonClass = cn(
  'grid size-8 shrink-0 place-items-center rounded text-[var(--fg-subtle)]',
  'pointer-coarse:size-11 pointer-coarse:opacity-100',
  'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
  'hover:bg-[var(--surface-raised)] focus-visible:opacity-100 disabled:opacity-40',
)
