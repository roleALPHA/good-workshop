import { cn } from '@/lib/cn'

/**
 * How a link in the library sidebar looks, active or not.
 *
 * In a module of its own, and deliberately without 'use client', because both
 * sides call it: the folder tree (a Client Component) and the tag list the
 * library page renders on the server. It used to live in folder-tree.tsx, and
 * a server call into a 'use client' module is refused at render time -- so the
 * library threw for every tenant that had a tag, and only for those.
 */
export const navClass = (active: boolean) =>
  cn(
    'block rounded px-2 py-1 text-[15px]',
    active
      ? 'bg-[var(--brand-subtle-bg)] text-[var(--brand-subtle-fg)]'
      : 'hover:bg-[var(--surface-raised)]',
  )
