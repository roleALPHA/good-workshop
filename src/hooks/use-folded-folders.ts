'use client'

import { useCallback, useMemo, useSyncExternalStore } from 'react'

/**
 * Which folders of the sidebar are folded, remembered in this browser.
 *
 * Per person and per device, deliberately not in the database: folding is how
 * one person keeps the tree small enough to read, and nobody else's sidebar
 * should close because of it.
 *
 * An external store rather than state, for two reasons. The tree and the drag
 * surface both need the answer -- the drag measures only the rows on screen --
 * and a toggle in one must reach the other at once. And the server snapshot is
 * "nothing folded", so the first client render matches the server HTML and the
 * stored folds apply right after, without a hydration mismatch.
 */

const KEY = 'gw.library.foldedFolders'
const listeners = new Set<() => void>()

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  // Another tab folding a folder folds it here too.
  window.addEventListener('storage', onChange)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onChange)
  }
}

/** The raw string: a stable snapshot, where a fresh Set would never compare equal. */
function read(): string {
  try {
    return window.localStorage.getItem(KEY) ?? ''
  } catch {
    // Storage blocked (private mode, a strict browser): nothing is remembered.
    return ''
  }
}

function parse(raw: string): Set<string> {
  if (!raw) return new Set()
  try {
    const value: unknown = JSON.parse(raw)
    return new Set(Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

export function useFoldedFolders(): {
  folded: ReadonlySet<string>
  toggle: (id: string) => void
} {
  const raw = useSyncExternalStore(subscribe, read, () => '')
  const folded = useMemo(() => parse(raw), [raw])

  const toggle = useCallback((id: string) => {
    const next = parse(read())
    if (next.has(id)) next.delete(id)
    else next.add(id)
    try {
      window.localStorage.setItem(KEY, JSON.stringify([...next]))
    } catch {
      return
    }
    for (const listener of listeners) listener()
  }, [])

  return { folded, toggle }
}
