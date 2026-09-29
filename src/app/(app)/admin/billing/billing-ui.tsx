'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

/** What the billing page's panels share: the styles, and how an action's answer is shown. */

export const card = 'rounded border border-[var(--border)] bg-[var(--surface)] p-4'
export const field =
  'mt-1 w-full rounded border border-[var(--border-strong)] bg-[var(--bg)] px-2.5 py-2 text-[16px]'
export const primary =
  'min-h-11 rounded bg-[var(--brand)] px-4 text-[15px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60'

export type Result = { ok: boolean; message?: string }

export function useAction() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const act = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      const result = await fn()
      if (!result.ok) {
        setError(result.message ?? null)
        return
      }
      setError(null)
      after?.()
      router.refresh()
    })
  return { error, pending, act }
}

export function Alert({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="mt-2 text-[14px] text-[var(--danger-fg)]">
      {message}
    </p>
  ) : null
}
