'use client'

import { useState, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, Folder as FolderIcon } from 'lucide-react'

/**
 * The folder tree, foldable on a phone and always open on a desktop.
 *
 * Shown in full on a narrow screen, a tree of any size pushes the workshops off
 * the bottom -- and on a phone the list is what you came for; the folders are
 * how you narrow it down once you need to. Hiding it outright was worse: that
 * left the phone with no way to see the structure at all.
 *
 * The button carries the name of the folder you are in, so the common question
 * -- "where am I?" -- is answered without opening anything.
 */
export function FolderPanel({
  current,
  children,
}: {
  current: string | null
  children: ReactNode
}) {
  const t = useTranslations('library')
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((shown) => !shown)}
        aria-expanded={open}
        aria-controls="folder-tree"
        className="mb-2 inline-flex w-full items-center gap-1.5 rounded border border-[var(--border)] px-2 py-1.5 text-[14px] text-[var(--fg-muted)] md:hidden"
      >
        <FolderIcon aria-hidden className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left">{current ?? t('allWorkshops')}</span>
        <ChevronDown
          aria-hidden
          className={`size-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
        <span className="sr-only">{open ? t('hideFolders') : t('showFolders')}</span>
      </button>

      {/* `hidden` rather than unmounted: the tree is server-rendered, and
          remounting it on every toggle would throw away scroll position. */}
      <div id="folder-tree" className={open ? 'block' : 'hidden md:block'}>
        {children}
      </div>
    </>
  )
}
