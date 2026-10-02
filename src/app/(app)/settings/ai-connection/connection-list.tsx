'use client'

import { useState, useTransition } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import type { Connection } from '@/domain/oauth/connections'
import { revokeConnectionAction } from '@/server/actions/tokens'

/**
 * The clients connected over OAuth, each with a way to end it.
 *
 * Next to the personal access tokens and shaped like them, because to the
 * person they are the same thing: something that acts in their name until they
 * say stop. No confirmation step, as with tokens -- a client that loses access
 * by mistake connects again in a minute, while one that keeps it by mistake is
 * the problem this list exists for.
 */
export function ConnectionList({ initial }: { initial: Connection[] }) {
  const t = useTranslations('settings.tokens.connections')
  const tScope = useTranslations('enums.tokenScope')
  const format = useFormatter()
  const [connections, setConnections] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function revoke(connection: Connection) {
    startTransition(async () => {
      const result = await revokeConnectionAction({ clientId: connection.clientId })
      if (!result.ok) {
        setDone(null)
        setError(result.message)
        return
      }
      setError(null)
      setDone(t('revoked', { name: connection.name }))
      setConnections((current) => current.filter((c) => c.clientId !== connection.clientId))
    })
  }

  return (
    <section className="mt-8">
      <h2 className="mb-1 text-[17px] font-medium">{t('title')}</h2>
      <p className="mb-3 text-[15px] text-[var(--fg-muted)]">{t('intro')}</p>

      {connections.length === 0 ? (
        <p className="text-[14px] text-[var(--fg-subtle)]">{t('empty')}</p>
      ) : (
        <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {connections.map((connection) => (
            <li
              key={connection.clientId}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{connection.name}</p>
                <p className="truncate text-[13px] text-[var(--fg-muted)]">
                  {connection.scopes
                    .map((scope) => (tScope.has(scope as never) ? tScope(scope as never) : scope))
                    .join(', ')}{' '}
                  · {t('since', { date: format.dateTime(connection.connectedAt, 'short') })}
                </p>
              </div>
              <span className="shrink-0 text-[13px] text-[var(--fg-subtle)]">
                {connection.lastUsedAt
                  ? t('lastUsed', { date: format.dateTime(connection.lastUsedAt, 'short') })
                  : t('neverUsed')}
              </span>
              <button
                type="button"
                disabled={pending}
                aria-label={t('revokeLabel', { name: connection.name })}
                onClick={() => revoke(connection)}
                className="shrink-0 rounded border border-[var(--border-strong)] px-2.5 py-1.5 text-[14px] hover:bg-[var(--surface-raised)] disabled:opacity-50"
              >
                {t('revoke')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[14px] text-[var(--danger-fg)]">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="mt-2 text-[14px] text-[var(--fg-muted)]">
          {done}
        </p>
      )}
    </section>
  )
}
