'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import type { Scope } from '@/domain/tenant/tokens'
import { approveAuthorization, denyAuthorization, type ConsentRequest } from './actions'

/**
 * Yes or no, and nothing in between.
 *
 * No scope checkboxes: the client asked for a set, and letting somebody hand
 * over half of it produces a client that fails later, somewhere else, with an
 * error nobody connects back to this screen. The honest controls are "give it
 * this" and "give it nothing".
 */
export function ConsentForm({
  clientName,
  email,
  scopes,
  offline,
  request,
}: {
  clientName: string
  email: string
  scopes: Scope[]
  offline: boolean
  request: ConsentRequest
}) {
  const t = useTranslations('oauth')
  const tScope = useTranslations('enums.tokenScope')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const go = (action: (req: ConsentRequest) => Promise<{ redirect: string } | { error: string }>) =>
    startTransition(async () => {
      const result = await action(request)
      if ('error' in result) {
        setError(result.error)
        return
      }
      // A full navigation rather than the router: the target is the client's
      // own address, which is frequently a loopback port or a custom scheme.
      window.location.href = result.redirect
    })

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-2 text-[15px]">{t.rich('intro', { client: () => <b>{clientName}</b> })}</p>

      <section className="mt-4 rounded border border-[var(--border-strong)] bg-[var(--surface-raised)] p-3">
        <p className="text-[14px] font-medium">{t('willBeAbleTo')}</p>
        {scopes.length === 0 ? (
          <p className="mt-1 text-[14px] text-[var(--fg-muted)]">{t('noScopes')}</p>
        ) : (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[14px] text-[var(--fg-muted)]">
            {scopes.map((scope) => (
              <li key={scope}>{tScope(scope)}</li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[13px] text-[var(--fg-subtle)]">{t('actsAsYou', { email })}</p>
        {offline && <p className="mt-1 text-[13px] text-[var(--fg-subtle)]">{t('offline')}</p>}
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || scopes.length === 0}
          onClick={() => go(approveAuthorization)}
          className="rounded bg-[var(--brand)] px-3 py-2 text-[15px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60 pointer-coarse:min-h-11"
        >
          {pending ? t('approving') : t('approve')}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => go(denyAuthorization)}
          className="rounded border border-[var(--border-strong)] px-3 py-2 text-[15px] hover:bg-[var(--surface-raised)] pointer-coarse:min-h-11"
        >
          {t('deny')}
        </button>
      </div>

      <p className="mt-3 text-[13px] text-[var(--fg-subtle)]">{t('revokeHint')}</p>

      {error && (
        <p role="alert" className="mt-2 text-[14px] text-[var(--danger-fg)]">
          {error}
        </p>
      )}
    </div>
  )
}
