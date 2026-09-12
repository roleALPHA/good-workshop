'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { useTranslations } from 'next-intl'

/**
 * Search in the URL, not in component state.
 *
 * A filtered library is a place people link to and come back to -- and the
 * server does the filtering, so the query has to reach it. Debounced, because
 * a round trip per keystroke is a round trip per keystroke.
 */
export function SearchBox() {
  const t = useTranslations('library')

  const router = useRouter()
  const params = useSearchParams()
  const current = params.get('q') ?? ''
  const [value, setValue] = useState(current)

  // Follows the URL when it changes from elsewhere -- the browser's back
  // button, or a click on a folder that drops the query.
  //
  // Adjusted DURING render rather than in an effect. React documents this shape
  // for exactly this case: the effect version renders once with the stale value
  // and then again with the new one, and the rule that flags it
  // (react-hooks/set-state-in-effect) is pointing at that wasted pass.
  const [seen, setSeen] = useState(current)
  if (current !== seen) {
    setSeen(current)
    setValue(current)
  }

  useEffect(() => {
    if (value === current) return
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      if (value.trim()) next.set('q', value.trim())
      else next.delete('q')
      // A page of results is not a step in history worth going back through.
      router.replace(`/library?${next.toString()}`)
    }, 250)
    return () => clearTimeout(timer)
  }, [value, current, params, router])

  return (
    <div className="relative">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--fg-subtle)]"
      />
      <input
        type="search"
        aria-label={t('searchLabel')}
        placeholder={t('search')}
        className="w-44 rounded border border-[var(--border-strong)] bg-[var(--surface)] py-1.5 pr-2.5 pl-8 text-[16px]"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
    </div>
  )
}
