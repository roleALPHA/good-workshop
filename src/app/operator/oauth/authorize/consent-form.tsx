'use client'

import { useState, useTransition } from 'react'
import { OPERATOR_SCOPE_TEXT } from '@/cloud/operator/scopes'
import {
  approveOperatorAuthorization,
  denyOperatorAuthorization,
  type OperatorConsentRequest,
} from './actions'

/**
 * Yes or no, and nothing in between.
 *
 * No scope checkboxes, for the reason the customers' screen gives: the client
 * asked for a set, and handing over half of it produces a client that fails
 * later, somewhere else, with an error nobody connects back to this screen.
 *
 * English and hardcoded, like the rest of the console -- it has one reader,
 * and the console layout loads only the `operator` message namespace. The
 * customers' ConsentForm is not reused for the same reason it is not
 * translated: it renders scope descriptions out of a catalogue this screen
 * does not have, and the words that matter here are about workspaces the
 * operator does not own.
 */
export function OperatorConsentForm({
  clientName,
  operatorName,
  scopes,
  offline,
  request,
}: {
  clientName: string
  operatorName: string
  scopes: OperatorConsentRequest['scopes']
  offline: boolean
  request: OperatorConsentRequest
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const go = (
    action: (req: OperatorConsentRequest) => Promise<{ redirect: string } | { error: string }>,
  ) =>
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

  const dangerous = scopes.includes('ops:danger')

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-semibold tracking-tight">Connect {clientName}?</h1>
      <p className="mt-2 text-[15px]">
        <b>{clientName}</b> is asking to act as the operator of this installation.
      </p>

      <section className="mt-4 rounded border border-[var(--border-strong)] bg-[var(--surface-raised)] p-3">
        <p className="text-[14px] font-medium">It will be able to:</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[14px] text-[var(--fg-muted)]">
          {scopes.map((scope) => (
            <li key={scope}>{OPERATOR_SCOPE_TEXT[scope]}</li>
          ))}
        </ul>
        <p className="mt-2 text-[13px] text-[var(--fg-subtle)]">
          It acts as you, {operatorName}, across every workspace on this installation.
        </p>
        {offline && (
          <p className="mt-1 text-[13px] text-[var(--fg-subtle)]">
            It can come back without you until you revoke it.
          </p>
        )}
      </section>

      {/* Named rather than merely granted. This is the scope that has to be
          asked for by name, and the person approving it should see that they
          are the one who said yes -- the staged-confirmation step later is
          about a particular workspace, not about this decision. */}
      {dangerous && (
        <p className="mt-3 text-[14px] text-[var(--warn-fg)]">
          This includes destructive actions. Each one still describes itself and waits for a
          separate confirmation before it happens.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || scopes.length === 0}
          onClick={() => go(approveOperatorAuthorization)}
          className="rounded bg-[var(--brand)] px-3 py-2 text-[15px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60 pointer-coarse:min-h-11"
        >
          {pending ? 'Connecting…' : 'Connect'}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => go(denyOperatorAuthorization)}
          className="rounded border border-[var(--border-strong)] px-3 py-2 text-[15px] hover:bg-[var(--surface-raised)] pointer-coarse:min-h-11"
        >
          Cancel
        </button>
      </div>

      <p className="mt-3 text-[13px] text-[var(--fg-subtle)]">
        You can revoke this at any time under Security.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-[14px] text-[var(--danger-fg)]">
          {error}
        </p>
      )}
    </div>
  )
}
