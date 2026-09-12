'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import type { Scope, TokenRow } from '@/domain/tenant/tokens'
import { createTokenAction, revokeTokenAction } from '@/server/actions/tokens'
import { CopyBlock } from '@/components/copy-block'
import { ConnectGuide } from './connect-guide'
import { useFormatter, useTranslations } from 'next-intl'

const DEFAULT_SCOPES: Scope[] = ['workshops:read', 'module_types:read']

export function TokenList({
  initial,
  scopes,
  origin,
}: {
  initial: TokenRow[]
  scopes: Scope[]
  /** The host an MCP client has to talk to, so the instructions are real. */
  origin: string
}) {
  const t = useTranslations('settings.tokens')
  const tc = useTranslations('common')
  const tScope = useTranslations('enums.tokenScope')
  const format = useFormatter()
  const router = useRouter()
  const [tokens, setTokens] = useState(initial)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [chosen, setChosen] = useState<Scope[]>(DEFAULT_SCOPES)
  const [fresh, setFresh] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const freshPanel = useRef<HTMLElement>(null)

  // The button that makes a token sits under the list, and the token appears
  // above it -- on a library of thirty tokens that is a screen and a half away,
  // so the one thing that is shown once would be shown off screen. Moving focus
  // rather than scrolling: it brings the panel into view AND tells somebody on a
  // screen reader where the answer went.
  useEffect(() => {
    if (fresh) freshPanel.current?.focus()
  }, [fresh])

  function create() {
    startTransition(async () => {
      const result = await createTokenAction({ name, scopes: chosen })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setError(null)
      setTokens((current) => [...current, result.data.row])
      setFresh(result.data.token)
      setName('')
      setCreating(false)
      router.refresh()
    })
  }

  function revoke(id: string) {
    startTransition(async () => {
      const result = await revokeTokenAction({ id })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setTokens((current) => current.filter((row) => row.id !== id))
      router.refresh()
    })
  }

  return (
    <div>
      {fresh && (
        <section
          ref={freshPanel}
          tabIndex={-1}
          // Named, so the value can be found without also matching the
          // truncated public halves in the list below it.
          aria-label={t('freshLabel')}
          className="mb-5 rounded border border-[var(--border-strong)] bg-[var(--surface-raised)] p-3 outline-offset-2"
        >
          <p className="text-[15px] font-medium">{t('freshLabel')}</p>
          <p className="mt-0.5 text-[14px] text-[var(--fg-muted)]">{t('freshHint')}</p>
          <CopyBlock value={fresh} label={t('connect.copyToken')} />
          <button
            type="button"
            onClick={() => setFresh(null)}
            className="mt-2 rounded px-2 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface)]"
          >
            {t('hide')}
          </button>
        </section>
      )}

      {fresh && <ConnectGuide origin={origin} token={fresh} />}

      {tokens.length > 0 && (
        <ul className="mb-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {tokens.map((token) => (
            <li key={token.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{token.name}</p>
                <p className="truncate text-[13px] text-[var(--fg-muted)]">
                  <code>gwp_{token.tokenId}_…</code> ·{' '}
                  {token.scopes.map((s) => tScope(s)).join(', ')}
                </p>
              </div>
              <span className="shrink-0 text-[13px] text-[var(--fg-subtle)]">
                {token.lastUsedAt
                  ? t('lastUsed', { date: format.dateTime(token.lastUsedAt, 'short') })
                  : t('neverUsed')}
              </span>
              <button
                type="button"
                disabled={pending}
                aria-label={t('revokeLabel', { name: token.name })}
                onClick={() => revoke(token.id)}
                className="shrink-0 rounded border border-[var(--border-strong)] px-2.5 py-1.5 text-[14px] hover:bg-[var(--surface-raised)] disabled:opacity-50"
              >
                {t('revoke')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <div className="rounded border border-[var(--border)] p-3">
          <label htmlFor="token-name" className="mb-1 block text-[14px]">
            {t('nameLabel')}
          </label>
          <input
            id="token-name"
            autoFocus
            placeholder={t('namePlaceholder')}
            className="w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-[16px]"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
          />

          <fieldset className="mt-3">
            <legend className="mb-1 text-[14px]">{t('scopesLabel')}</legend>
            <div className="space-y-1">
              {scopes.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-[15px]">
                  <input
                    type="checkbox"
                    checked={chosen.includes(scope)}
                    onChange={(e) =>
                      setChosen((current) =>
                        e.target.checked ? [...current, scope] : current.filter((s) => s !== scope),
                      )
                    }
                  />
                  {tScope(scope)}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-[var(--fg-muted)]">{t('noUserAdmin')}</p>
          </fieldset>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={create}
              disabled={pending || name.trim() === '' || chosen.length === 0}
              className="rounded bg-[var(--brand)] px-3 py-1.5 text-[15px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60"
            >
              {pending ? t('creating') : t('create')}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded px-3 py-1.5 text-[15px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
            >
              {tc('cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1.5 rounded bg-[var(--brand)] px-3 py-1.5 text-[15px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)]"
        >
          <Plus aria-hidden className="size-4" />
          {t('create')}
        </button>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[14px] text-[var(--danger-fg)]">
          {error}
        </p>
      )}

      {!fresh && <ConnectGuide origin={origin} token={null} />}
    </div>
  )
}
