'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { FolderNode } from '@/domain/workshop/repo'
import { ROOT_DROP_ID } from '@/features/library/drag'
import { filterFolderTree, visibleFolders } from '@/features/library/folder-tree'
import { useFoldedFolders } from '@/hooks/use-folded-folders'
import { cn } from '@/lib/cn'
import { DropTarget } from './drag-parts'
import { FolderRow } from './folder-row'
import { useLibraryDrag } from './library-dnd'
import { navClass } from './nav-class'

/**
 * The folder tree, a search over it, and the row above it that means "no
 * folder".
 *
 * A client component because the whole tree is one drop surface: "Alle
 * Workshops" is not decoration, it is the target you aim at to take something
 * out of every folder.
 *
 * The search filters in the browser, not through the URL like the workshop
 * search: the tree is already here in full, and a folder search is a way to
 * find a row, not a place anybody links to.
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
  const [query, setQuery] = useState('')
  const { folded, toggle } = useFoldedFolders()

  const searching = query.trim() !== ''
  // A search looks inside folded branches too: a folder you are looking for is
  // most likely one you folded away.
  const shown = useMemo(
    () => (searching ? filterFolderTree(folders, query) : visibleFolders(folders, folded)),
    [searching, folders, query, folded],
  )
  const parents = useMemo(
    () => new Set(folders.flatMap((node) => (node.parentId === null ? [] : [node.parentId]))),
    [folders],
  )

  // Out of a folder and onto the top level: nothing above to highlight, so the
  // root row takes it.
  const draggedParent =
    active?.kind === 'folder' ? folders.find((node) => node.id === active.id)?.parentId : undefined
  const folderToTop =
    active?.kind === 'folder' &&
    projection?.valid === true &&
    projection.parentId === null &&
    draggedParent !== null

  const droppingWorkshop = active?.kind === 'workshop'

  return (
    <>
      {folders.length > 0 && (
        <div className="relative mb-2">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-[var(--fg-subtle)]"
          />
          <input
            type="search"
            aria-label={t('folderSearchLabel')}
            placeholder={t('folderSearch')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && query !== '') {
                event.preventDefault()
                setQuery('')
              }
            }}
            className="w-full rounded border border-[var(--border)] bg-[var(--surface)] py-1 pr-2 pl-7 text-[16px]"
          />
        </div>
      )}

      <ul className="space-y-0.5">
        <DropTarget id={ROOT_DROP_ID}>
          {({ ref }) => (
            <li ref={ref} className="relative">
              <Link
                href="/library"
                className={cn(
                  navClass(!current && !tagged),
                  droppingWorkshop && 'ring-1 ring-[var(--border-strong)] ring-inset',
                  folderToTop && 'ring-2 ring-[var(--brand-ring)] ring-inset',
                )}
              >
                {t('allWorkshops')}
              </Link>
            </li>
          )}
        </DropTarget>

        {shown.map((node) => (
          <FolderRow
            key={node.id}
            id={node.id}
            name={node.name}
            parentId={node.parentId}
            depth={node.depth}
            active={current === node.id}
            canManage={canManage}
            // No toggle during a search: the result shows every path in full,
            // and a fold pressed there would change nothing you can see.
            foldable={!searching && parents.has(node.id)}
            folded={folded.has(node.id)}
            onToggleFold={() => toggle(node.id)}
            // A folder drag aims between rows, and in a filtered tree the rows
            // it would aim between are not the ones it lands between. Filing a
            // workshop onto a folder still works; the select still works.
            draggable={!searching}
            // Its own subtree is left out: moving a folder into itself or below
            // itself would detach the branch from the root. The domain refuses it
            // too -- this just keeps it off the menu.
            targets={folders.filter(
              (other) => other.id !== node.id && !other.ancestorIds.includes(node.id),
            )}
          />
        ))}
      </ul>

      {searching && shown.length === 0 && (
        <p className="px-2 py-1 text-[13px] text-[var(--fg-subtle)]">
          {t('noFolderMatch', { query: query.trim() })}
        </p>
      )}
    </>
  )
}
