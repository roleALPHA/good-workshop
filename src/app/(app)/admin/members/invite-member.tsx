'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { inviteMemberAction, type InviteOutcome } from '@/server/actions/members'

/**
 * Inviting is one field and one choice, inline.
 *
 * No dialog, per the inline-editing rule: the list of who is already here
 * stays visible while you type, which is exactly what stops you inviting
 * somebody twice.
 */
export function InviteMember() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'member' | 'admin'>('member')
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<InviteOutcome | null>(null)
  const [pending, startTransition] = useTransition()

  function invite() {
    if (email.trim() === '') return
    startTransition(async () => {
      const result = await inviteMemberAction({ email, role })
      if (!result.ok) {
        setError(result.message)
        return
      }
      setOutcome(result.data)
      setEmail('')
      router.refresh()
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded bg-[var(--brand)] px-3 py-1.5 text-[15px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)]"
      >
        <Plus aria-hidden className="size-4" />
        Mitglied einladen
      </button>
    )
  }

  return (
    <div className="w-full max-w-xl">
      <div className="flex flex-wrap items-start gap-2">
        <input
          autoFocus
          type="email"
          aria-label="E-Mail-Adresse"
          placeholder="kollegin@example.com"
          className="min-w-56 flex-1 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-[16px]"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') invite()
            if (e.key === 'Escape') setOpen(false)
          }}
        />
        <select
          aria-label="Rolle"
          className="rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-[16px]"
          value={role}
          onChange={(e) => setRole(e.target.value as 'member' | 'admin')}
        >
          <option value="member">Mitglied</option>
          <option value="admin">Admin</option>
        </select>
        <button
          type="button"
          onClick={invite}
          disabled={pending || email.trim() === ''}
          className="rounded bg-[var(--brand)] px-3 py-1.5 text-[15px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60"
        >
          {pending ? 'Einladen …' : 'Einladen'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[14px] text-[var(--danger-fg)]">
          {error}
        </p>
      )}
      {outcome && <InviteReport outcome={outcome} />}
    </div>
  )
}

/**
 * What actually happened, including when it was not what the admin expected.
 *
 * An install without an SMTP relay is a supported setup, and "Einladung
 * verschickt" would be a lie there. The link is shown instead, once, with what
 * it does spelled out -- whoever opens it is signed in as that person.
 */
function InviteReport({ outcome }: { outcome: InviteOutcome }) {
  return (
    <div className="mt-2 rounded border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-[14px]">
      <p>
        {outcome.alreadyMember
          ? `${outcome.email} war schon Mitglied.`
          : `${outcome.email} wurde eingeladen.`}{' '}
        {outcome.mailed ? 'Der Anmeldelink ist unterwegs.' : null}
      </p>

      {outcome.link && (
        <div className="mt-2">
          <p className="text-[var(--fg-muted)]">
            Es ist kein Mailversand eingerichtet. Gib diesen Link persönlich weiter — wer ihn
            öffnet, ist als {outcome.email} angemeldet.
          </p>
          <code className="mt-1 block rounded bg-[var(--surface)] px-2 py-1.5 text-[13px] break-all">
            {outcome.link}
          </code>
        </div>
      )}
    </div>
  )
}
