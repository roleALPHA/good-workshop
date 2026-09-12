'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { useTranslations } from 'next-intl'

/**
 * A block of text that is there to be taken away.
 *
 * The first clipboard in this codebase, and it is deliberately not a bare
 * `navigator.clipboard.writeText`. That call is unavailable on an insecure
 * origin and is refused outright by some browsers and policies, and a copy
 * button that silently does nothing is worse than no button: the person walks
 * away believing they hold a token they do not hold.
 *
 * So a refusal never claims success. It selects the block instead, which puts
 * the very next Ctrl+C exactly where the button would have put it.
 */
export function CopyBlock({ value, label }: { value: string; label: string }) {
  const t = useTranslations('common')
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const block = useRef<HTMLPreElement>(null)

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      selectTheBlock(block.current)
      return
    }
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-2">
      <div className="flex items-start gap-2">
        <pre
          ref={block}
          className="min-w-0 flex-1 overflow-hidden rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-[13px] break-all whitespace-pre-wrap"
        >
          <code>{value}</code>
        </pre>
        <button
          type="button"
          onClick={copy}
          aria-label={label}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded border border-[var(--border-strong)] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)] pointer-coarse:size-11"
        >
          {copied ? (
            <Check aria-hidden className="size-4" />
          ) : (
            <Copy aria-hidden className="size-4" />
          )}
        </button>
      </div>
      {/* Announced, not just drawn: the icon swap alone reaches nobody who is
          not looking at it. */}
      <span role="status" className="mt-1 block text-[13px] text-[var(--fg-muted)]">
        {copied ? t('copied') : ''}
      </span>
    </div>
  )
}

/** The fallback for a refused clipboard: hand the selection over instead. */
function selectTheBlock(node: HTMLElement | null) {
  const selection = node && window.getSelection?.()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(node)
  selection.removeAllRanges()
  selection.addRange(range)
}
