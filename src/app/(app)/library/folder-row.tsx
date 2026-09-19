'use client'

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
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
  const [confirming, setConfirming] = useState(false)
  const [showName, setShowName] = useState(false)
  const nameRef = useRef<HTMLSpanElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)

  /**
   * The whole name, but only where some of it is out of sight.
   *
   * Out of sight twice over: cut off by the column, or -- the moment the pointer
   * arrives -- covered by the row's buttons, which lie over the end of the name
   * (see `actionsClass`). A native `title` did neither well: it came after a
   * second, and not at all over the part the buttons hide.
   */
  function revealName() {
    const text = nameRef.current
    if (!text || dragging) return
    const actions = actionsRef.current?.getBoundingClientRect()
    const cutOff = text.scrollWidth > text.clientWidth
    // Only an overlay covers anything; under a thumb the bar sits in the flow,
    // to the right of the name, and has no width to speak of until laid out.
    const covered =
      actions !== undefined &&
      actions.width > 0 &&
      text.getBoundingClientRect().left + text.scrollWidth > actions.left
    setShowName(cutOff || covered)
  }

  function remove() {
    setFailed(null)
    setConfirming(false)
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
            {foldable && (
              <button
                type="button"
                onClick={onToggleFold}
                aria-expanded={!folded}
                aria-label={folded ? t('expandFolder', { name }) : t('collapseFolder', { name })}
                className={foldClass}
              >
                <ChevronRight
                  aria-hidden
                  className={cn(
                    'size-3.5 transition-transform motion-reduce:transition-none',
                    !folded && 'rotate-90',
                  )}
                />
              </button>
            )}

            <Link
              href={`/library?folder=${id}`}
              // A drop that lands on a link would otherwise navigate as well.
              onClickCapture={(event) => {
                if (dragging) event.preventDefault()
              }}
              onPointerEnter={revealName}
              onPointerLeave={() => setShowName(false)}
              onFocus={revealName}
              onBlur={() => setShowName(false)}
              className={cn(
                // Left padding on every row, foldable or not, so names line up
                // for their depth -- the toggle sits in it rather than beside it.
                'inline-flex min-w-0 flex-1 items-center gap-1.5 rounded py-1 pr-2 pl-6 text-[15px]',
                'pointer-coarse:pl-8',
                active
                  ? 'bg-[var(--surface-raised)] font-medium'
                  : 'text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]',
              )}
            >
              <FolderIcon aria-hidden className="size-3.5 shrink-0" />
              <span ref={nameRef} data-folder-name className="truncate">
                {name}
              </span>
            </Link>

            {/* Hidden from assistive tech: the link already carries the name. */}
            {showName && (
              <span aria-hidden data-testid="folder-name-tooltip" className={tooltipClass}>
                {name}
              </span>
            )}

            <div ref={actionsRef} className={actionsClass}>
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
                  onClick={() => setConfirming((open) => !open)}
                  disabled={pending}
                  aria-expanded={confirming}
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

          {/* Asked, not done: this button sits in a bar a keyboard reaches
              while it is still invisible, and one Enter there used to unfile
              every workshop in the folder and drop its sharing, with nothing
              to undo it. */}
          {confirming && (
            <div className="mt-1 ml-2 rounded border border-[var(--border)] bg-[var(--surface)] p-2">
              <p className="text-[13px]">{t('removeFolderWarning', { name })}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {/* Not the label of the button that opened this: the second one
                    is the one that cannot be taken back. */}
                <button
                  type="button"
                  onClick={remove}
                  disabled={pending}
                  className="rounded bg-[var(--danger-fg)] px-2 py-1.5 text-[13px] font-medium text-[var(--bg)] disabled:opacity-50 pointer-coarse:min-h-11"
                >
                  {t('removeFolderConfirm')}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded px-2 py-1.5 text-[13px] hover:bg-[var(--surface-raised)] pointer-coarse:min-h-11"
                >
                  {t('cancel')}
                </button>
              </div>
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
 * Hidden by opacity AND by pointer-events, which the first version got wrong.
 * The reasoning then was that a pointer cannot reach a button without hovering
 * the row first, so nobody clicks one they could not see. Use says otherwise:
 * the click that reveals the bar lands on it. Selecting a folder took two
 * clicks, and clicking a long name opened its access page instead -- the bar
 * lies over the end of the name.
 *
 * Opacity still carries the reveal, so the buttons stay in the tab order and
 * the library's end-to-end tests can aim at them by name; focus-within makes
 * them clickable for a keyboard, hover for a pointer.
 *
 * On a coarse pointer there is no hover to reveal anything with, so the bar
 * goes back into the flow, always visible -- the name yields there, as before.
 */
const actionsClass = cn(
  'absolute inset-y-0 right-0 flex items-center gap-1 rounded bg-[var(--bg)] pl-1',
  'pointer-events-none opacity-0 group-hover:opacity-100 group-focus-within:opacity-100',
  'group-hover:pointer-events-auto group-focus-within:pointer-events-auto',
  'pointer-coarse:static pointer-coarse:opacity-100 pointer-coarse:pointer-events-auto',
)

/**
 * The full folder name, just below the row.
 *
 * Below rather than beside: the sidebar is 240px, and whatever is too long for
 * it needs the room of the page. It may reach over the workshop list and over
 * the next row, so it takes no pointer events -- the row underneath stays
 * clickable. Lined up with the name (past the fold toggle and the icon), so it
 * reads as that name spelled out.
 */
const tooltipClass = cn(
  'pointer-events-none absolute top-full left-10 z-20 mt-1 w-max max-w-[min(28rem,80vw)]',
  'rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[14px] break-words',
  'text-[var(--fg)] shadow-md',
)

/**
 * The fold toggle, laid over the link's left padding.
 *
 * Not beside the link, in the flow: that took 24px from a 200px sidebar, and
 * the middle of every name slid under the row's buttons, which catch clicks
 * while still invisible (see `actionsClass`). Over the padding, the link keeps
 * the whole row and the name keeps its room.
 *
 * Wider under a thumb, though not the full 44px: the row's own buttons already
 * take that, and a second one per row would leave no room for the name.
 */
const foldClass = cn(
  'absolute inset-y-0 left-0 z-10 grid w-6 place-items-center rounded text-[var(--fg-subtle)]',
  'hover:bg-[var(--surface-raised)] pointer-coarse:w-8',
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
