'use client'

import { useState, useTransition } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { issueTokenAction, revokeTokenAction } from './actions'

export type TokenRow = {
  id: string
  name: string
  scopes: string[]
  createdAt: string
  expiresAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}

/**
 * The credentials an operator uses through a model.
 *
 * The secret is shown ONCE, right here, and never again -- the row keeps a key
 * and a hash. A screen that could show it a second time would be a screen
 * worth stealing, and the whole point of hashing it is that this page cannot.
 *
 * Every scope is a checkbox rather than a preset. "Read only" and "everything"
 * are the two presets somebody would reach for, and both are the wrong default:
 * the useful token is the narrow one somebody thought about.
 */
export function Tokens({ tokens, scopes }: { tokens: TokenRow[]; scopes: readonly string[] }) {
  const t = useTranslations('operator.tokens')
  const format = useFormatter()
  const [pending, start] = useTransition()
  const [issued, setIssued] = useState<string | null>(null)

  const when = (value: string | null) =>
    value ? format.dateTime(new Date(value), { dateStyle: 'medium' }) : t('never')

  return (
    <section className="mt-10" aria-labelledby="tokens">
      <h2 id="tokens" className="text-[17px] font-medium">
        {t('title')}
      </h2>
      <p className="mt-1 max-w-2xl text-[15px] text-[var(--fg-muted)]">{t('intro')}</p>

      {issued && (
        <div className="mt-3 rounded border border-[var(--border-strong)] bg-[var(--surface-raised)] p-3">
          <p className="text-[14px]">{t('issued')}</p>
          <code className="mt-1 block text-[14px] break-all">{issued}</code>
        </div>
      )}

      <form
        className="mt-4 rounded border border-[var(--border)] p-3"
        action={(data) => {
          start(async () => {
            const result = await issueTokenAction({
              name: String(data.get('name') ?? ''),
              scopes: scopes.filter((scope) => data.get(scope) === 'on'),
              days: String(data.get('days') ?? '30'),
            })
            if (result.ok && result.token) setIssued(result.token)
          })
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[14px] text-[var(--fg-subtle)]">
            {t('name')}
            <input
              name="name"
              required
              maxLength={80}
              className="min-h-11 w-52 rounded border border-[var(--border)] px-2 text-[16px]"
            />
          </label>
          <label className="flex flex-col gap-1 text-[14px] text-[var(--fg-subtle)]">
            {t('days')}
            <input
              name="days"
              type="number"
              min={1}
              max={90}
              defaultValue={30}
              className="min-h-11 w-24 rounded border border-[var(--border)] px-2 text-[16px]"
            />
          </label>
        </div>

        <fieldset className="mt-3">
          <legend className="text-[14px] text-[var(--fg-subtle)]">{t('scopes')}</legend>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
            {scopes.map((scope) => (
              <label key={scope} className="flex min-h-11 items-center gap-2 text-[15px]">
                <input type="checkbox" name={scope} />
                <code className="text-[14px]">{scope}</code>
              </label>
            ))}
          </div>
        </fieldset>

        <button
          type="submit"
          disabled={pending}
          className="mt-3 min-h-11 rounded border border-[var(--border-strong)] px-4 text-[15px] disabled:opacity-60"
        >
          {t('issue')}
        </button>
      </form>

      {tokens.length === 0 ? (
        <p className="mt-3 text-[15px] text-[var(--fg-muted)]">{t('none')}</p>
      ) : (
        <ul className="mt-4 divide-y divide-[var(--border)] rounded border border-[var(--border)]">
          {tokens.map((token) => (
            <li key={token.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 p-3">
              <span className="flex-1 text-[15px]">
                {token.name}
                {token.revokedAt && (
                  <span className="ml-2 text-[14px] text-[var(--fg-subtle)]">{t('revoked')}</span>
                )}
              </span>
              <code className="text-[13px] text-[var(--fg-subtle)]">{token.scopes.join(' ')}</code>
              <span className="text-[14px] text-[var(--fg-subtle)] tabular-nums">
                {t('expires')} {when(token.expiresAt)}
              </span>
              <span className="text-[14px] text-[var(--fg-subtle)] tabular-nums">
                {t('lastUsed')} {when(token.lastUsedAt)}
              </span>
              {!token.revokedAt && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => void (await revokeTokenAction({ tokenId: token.id })))
                  }
                  className="min-h-11 rounded border border-[var(--border-strong)] px-3 text-[14px] text-[var(--danger-fg)] disabled:opacity-60"
                >
                  {t('revoke')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
