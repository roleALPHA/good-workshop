'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import type { FolderNode } from '@/domain/workshop/repo'
import { ROOT_DROP_ID } from '@/features/library/drag'
import { cn } from '@/lib/cn'
import { DropTarget } from './drag-parts'
import { FolderRow } from './folder-row'
import { useLibraryDrag } from './library-dnd'

/**
 * The folder tree, and the row above it that means "no folder".
 *
 * A client component because the whole tree is one drop surface: "Alle
 * Workshops" is not decoration, it is the target you aim at to take something
 * out of every folder.
 */
export function FolderTree({
  folders,
  current,
  tagged,
  canManage,
}: {
  folders: FolderNode[]
  current: string | undefined
  /** A tag filter is on, so no folder is the active one. */
  tagged: boolean
  canManage: boolean
}) {
  const t = useTranslations('library')
  const { active, projection } = useLibraryDrag()

  // A folder landing first at the top level has nothing above it to draw a line
  // under, so the line goes here.
  const lineAtTop =
    active?.kind === 'folder' &&
    projection?.valid === true &&
    projection.parentId === null &&
    projection.afterId === null

  const droppingWorkshop = active?.kind === 'workshop'

  return (
    <ul className="space-y-0.5">
      <DropTarget id={ROOT_DROP_ID}>
        {({ ref }) => (
          <li ref={ref} className="relative">
            {lineAtTop && <InsertionLine depth={0} />}
            <Link
              href="/library"
              className={cn(
                navClass(!current && !tagged),
                droppingWorkshop && 'ring-1 ring-[var(--border-strong)] ring-inset',
              )}
            >
              {t('allWorkshops')}
            </Link>
          </li>
        )}
      </DropTarget>

      {folders.map((node) => (
        <FolderRow
          key={node.id}
          id={node.id}
          name={node.name}
          parentId={node.parentId}
          depth={node.depth}
          active={current === node.id}
          canManage={canManage}
          // Its own subtree is left out: moving a folder into itself or below
          // itself would detach the branch from the root. The domain refuses it
          // too -- this just keeps it off the menu.
          targets={folders.filter(
            (other) => other.id !== node.id && !other.ancestorIds.includes(node.id),
          )}
        />
      ))}
    </ul>
  )
}

/** Where the dragged folder would slot in, drawn at the depth it would take. */
export function InsertionLine({ depth }: { depth: number }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute -top-px right-0 left-0 h-0.5 rounded bg-[var(--brand-ring)]"
      style={{ marginLeft: depth * 12 }}
    />
  )
}

export const navClass = (active: boolean) =>
  cn(
    'block rounded px-2 py-1 text-[15px]',
    active
      ? 'bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]'
      : 'hover:bg-[var(--surface-raised)]',
  )
