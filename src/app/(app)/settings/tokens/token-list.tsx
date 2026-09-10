'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import type { TokenRow } from '@/domain/tenant/tokens'
import { createTokenAction, revokeTokenAction } from '@/server/actions/tokens'

const SCOPE_LABELS: Record<string, string> = {
  'workshops:read': 'Workshops lesen',
  'workshops:write': 'Workshops schreiben',
  'module_types:read': 'Modultypen lesen',
  'module_types:write': 'Modultypen schreiben',
  'tenant:read': 'Tenant lesen',
}

const DEFAULT_SCOPES = ['workshops:read', 'module_types:read']

export function TokenList({ initial, scopes }: { initial: TokenRow[]; scopes: string[] }) {
  const router = useRouter()
  const [tokens, setTokens] = useState(initial)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [chosen, setChosen] = useState<string[]>(DEFAULT_SCOPES)
  const [fresh, setFresh] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

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
          // Named, so the value can be found without also matching the
          // truncated public halves in the list below it.
          aria-label="Dein neues Token"
          className="mb-5 rounded border border-[var(--border-strong)] bg-[var(--surface-raised)] p-3"
        >
          <p className="text-[15px] font-medium">Dein neues Token</p>
          <p className="mt-0.5 text-[14px] text-[var(--fg-muted)]">
            Es wird nur einmal angezeigt — gespeichert ist nur sein Hash. Trag es im Client als{' '}
            <code>Authorization: Bearer …</code> gegen <code>/api/mcp</code> ein.
          </p>
          <code className="mt-2 block rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 font-mono text-[13px] break-all">
            {fresh}
          </code>
          <button
            type="button"
            onClick={() => setFresh(null)}
            className="mt-2 rounded px-2 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface)]"
          >
            Verstanden, ausblenden
          </button>
        </section>
      )}

      {tokens.length > 0 && (
        <ul className="mb-4 divide-y divide-[var(--border)] border-y border-[var(--border)]">
          {tokens.map((token) => (
            <li key={token.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium">{token.name}</p>
                <p className="truncate text-[13px] text-[var(--fg-muted)]">
                  <code>gwp_{token.tokenId}_…</code> ·{' '}
                  {token.scopes.map((s) => SCOPE_LABELS[s] ?? s).join(', ')}
                </p>
              </div>
              <span className="shrink-0 text-[13px] text-[var(--fg-subtle)]">
                {token.lastUsedAt
                  ? `zuletzt ${token.lastUsedAt.toLocaleDateString('de-DE')}`
                  : 'nie benutzt'}
              </span>
              <button
                type="button"
                disabled={pending}
                aria-label={`Token ${token.name} zurückziehen`}
                onClick={() => revoke(token.id)}
                className="shrink-0 rounded border border-[var(--border-strong)] px-2.5 py-1.5 text-[14px] hover:bg-[var(--surface-raised)] disabled:opacity-50"
              >
                Zurückziehen
              </button>
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <div className="rounded border border-[var(--border)] p-3">
          <label htmlFor="token-name" className="mb-1 block text-[14px]">
            Wofür ist es?
          </label>
          <input
            id="token-name"
            autoFocus
            placeholder="z. B. Claude Desktop"
            className="w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-[16px]"
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setError(null)
            }}
          />

          <fieldset className="mt-3">
            <legend className="mb-1 text-[14px]">Was darf es?</legend>
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
                  {SCOPE_LABELS[scope] ?? scope}
                </label>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-[var(--fg-muted)]">
              Nutzerverwaltung steht bewusst nicht zur Wahl: ein MCP-Client darf niemals jemanden
              einladen oder zum Admin machen.
            </p>
          </fieldset>

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={create}
              disabled={pending || name.trim() === '' || chosen.length === 0}
              className="rounded bg-[var(--brand)] px-3 py-1.5 text-[15px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60"
            >
              {pending ? 'Anlegen …' : 'Token anlegen'}
            </button>
            <button
              type="button"
              onClick={() => setCreating(false)}
              className="rounded px-3 py-1.5 text-[15px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
            >
              Abbrechen
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
          Token anlegen
        </button>
      )}

      {error && (
        <p role="alert" className="mt-2 text-[14px] text-[var(--danger-fg)]">
          {error}
        </p>
      )}
    </div>
  )
}
