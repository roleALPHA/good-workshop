'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { MemberRow } from '@/domain/tenant/members'
import {
  removeMemberAction,
  setMemberRoleAction,
  setMemberStatusAction,
} from '@/server/actions/members'
import { useTranslations } from 'next-intl'

/**
 * The list, edited in place.
 *
 * Role and status are select and button right in the row -- no detail page, no
 * dialog. The refusals that matter ("that is the last admin") come back from
 * the server as sentences and are shown next to the row that caused them,
 * because a message at the top of the page about a row further down is a
 * message nobody connects to what they just did.
 *
 * Removing is the exception to "edited in place", and it is the same exception
 * the bin makes: a panel opens under the row, says what will happen, and asks
 * for the address to be typed. Everywhere else in this application the worst
 * case is a trip to the bin; from here there is no way back. The successor is
 * chosen in that panel rather than afterwards, because afterwards there is
 * nobody left to ask about.
 */
export function MembersTable({ members }: { members: MemberRow[] }) {
  const t = useTranslations('admin.members')
  const tStatus = useTranslations('enums.memberStatus')
  const tRole = useTranslations('enums.memberRole')
  const router = useRouter()
  const [error, setError] = useState<{ memberId: string; message: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const [removing, setRemoving] = useState<string | null>(null)
  const [successor, setSuccessor] = useState('')
  const [typed, setTyped] = useState('')

  function openRemoval(memberId: string) {
    setRemoving(removing === memberId ? null : memberId)
    setSuccessor('')
    setTyped('')
    setError(null)
  }

  const run = (memberId: string, fn: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      const result = await fn()
      if (!result.ok) {
        setError({ memberId, message: result.message ?? 'Das hat nicht geklappt.' })
        return
      }
      setError(null)
      router.refresh()
    })

  return (
    <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
      {members.map((person) => (
        <li key={person.id} className="py-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-medium">
                {person.displayName || person.email}
                {person.isSelf && <span className="text-[var(--fg-subtle)]"> · du</span>}
              </p>
              {person.displayName && (
                <p className="truncate text-[13px] text-[var(--fg-muted)]">{person.email}</p>
              )}
            </div>

            <span
              className={`rounded px-1.5 py-0.5 text-[13px] ${
                person.status === 'active'
                  ? 'text-[var(--fg-muted)]'
                  : 'bg-[var(--surface-raised)] text-[var(--fg-muted)]'
              }`}
            >
              {tStatus(person.status)}
            </span>

            <select
              aria-label={t('roleOf', { email: person.email })}
              className="rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2 py-1.5 text-[16px]"
              value={person.role}
              disabled={pending}
              onChange={(e) =>
                run(person.id, () =>
                  setMemberRoleAction({
                    memberId: person.id,
                    role: e.target.value as 'member' | 'admin',
                  }),
                )
              }
            >
              <option value="member">{tRole('member')}</option>
              <option value="admin">{tRole('admin')}</option>
            </select>

            <button
              type="button"
              disabled={pending || person.isSelf}
              onClick={() =>
                run(person.id, () =>
                  setMemberStatusAction({
                    memberId: person.id,
                    status: person.status === 'disabled' ? 'active' : 'disabled',
                  }),
                )
              }
              className="rounded border border-[var(--border-strong)] px-2.5 py-1.5 text-[14px] hover:bg-[var(--surface-raised)] disabled:opacity-40"
            >
              {person.status === 'disabled' ? t('enable') : t('disable')}
            </button>

            <button
              type="button"
              disabled={pending || person.isSelf}
              onClick={() => openRemoval(person.id)}
              className="rounded px-2.5 py-1.5 text-[14px] text-[var(--warn-fg)] hover:bg-[var(--surface-raised)] disabled:opacity-40"
            >
              {t('remove')}
            </button>
          </div>

          {removing === person.id && (
            <RemovalPanel
              person={person}
              candidates={members.filter((other) => other.id !== person.id)}
              successor={successor}
              onSuccessor={setSuccessor}
              typed={typed}
              onTyped={setTyped}
              pending={pending}
              onCancel={() => setRemoving(null)}
              onConfirm={() =>
                run(person.id, async () => {
                  const result = await removeMemberAction({
                    memberId: person.id,
                    // Empty string is the "not chosen yet" state of a select,
                    // not a member id. The domain distinguishes "no successor
                    // needed" from "none given", so it has to arrive as null.
                    successorId: successor || null,
                  })
                  if (result.ok) setRemoving(null)
                  return result
                })
              }
            />
          )}

          {error?.memberId === person.id && (
            <p role="alert" className="mt-2 text-[14px] text-[var(--danger-fg)]">
              {error.message}
            </p>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * What is about to be lost, and who gets what is left.
 *
 * The counts are shown before the successor is chosen, in that order on
 * purpose: "3 Workshops, 1 Ordner" is the sentence that makes somebody think
 * about WHO should get them. A successor field above the number is a form
 * field; below it, it is a decision.
 *
 * Disabled members are offered as successors but marked, rather than hidden.
 * Somebody on leave is often exactly the right person to inherit a team's
 * workshops -- the server refuses it, and the label says why before the refusal
 * does.
 */
function RemovalPanel({
  person,
  candidates,
  successor,
  onSuccessor,
  typed,
  onTyped,
  pending,
  onCancel,
  onConfirm,
}: {
  person: MemberRow
  candidates: MemberRow[]
  successor: string
  onSuccessor: (value: string) => void
  typed: string
  onTyped: (value: string) => void
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const t = useTranslations('admin.members')
  const tStatus = useTranslations('enums.memberStatus')
  const name = person.displayName || person.email
  const owns = person.owns.workshops > 0 || person.owns.folders > 0
  const ready = typed.trim().toLowerCase() === person.email.toLowerCase() && (!owns || !!successor)

  return (
    <div className="mt-3 rounded border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-[15px] font-medium">{t('removeHeading', { name })}</p>
      <p className="mt-1 text-[14px]">{t('removeWarning')}</p>
      <p className="mt-1 text-[13px] text-[var(--fg-muted)]">{t('removeForgets')}</p>

      <p className="mt-3 text-[14px]">
        {owns
          ? t('removeOwns', { workshops: person.owns.workshops, folders: person.owns.folders })
          : t('removeOwnsNothing')}
      </p>

      {owns && (
        <>
          <label
            htmlFor={`successor-${person.id}`}
            className="mt-2 block text-[13px] text-[var(--fg-muted)]"
          >
            {t('successor')}
          </label>
          <select
            id={`successor-${person.id}`}
            value={successor}
            onChange={(event) => onSuccessor(event.target.value)}
            disabled={pending}
            className="mt-1 w-full rounded border border-[var(--border-strong)] bg-[var(--bg)] px-2 py-2 text-[16px]"
          >
            <option value="">{t('successorPlaceholder')}</option>
            {candidates.map((other) => (
              <option key={other.id} value={other.id}>
                {other.displayName || other.email}
                {other.status === 'disabled' ? ` (${tStatus('disabled')})` : ''}
              </option>
            ))}
          </select>
        </>
      )}

      <label
        htmlFor={`confirm-member-${person.id}`}
        className="mt-3 block text-[13px] text-[var(--fg-muted)]"
      >
        {t('removeTypeLabel', { email: person.email })}
      </label>
      <div className="mt-1 flex flex-wrap gap-2">
        <input
          id={`confirm-member-${person.id}`}
          value={typed}
          onChange={(event) => onTyped(event.target.value)}
          autoComplete="off"
          className="min-w-[14rem] flex-1 rounded border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[16px]"
        />
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="rounded border border-[var(--border-strong)] px-3 py-2 text-[14px] hover:bg-[var(--surface-raised)] disabled:opacity-60"
        >
          {t('removeCancel')}
        </button>
        {/* Not the same label as the button that opened this panel: two
            identical "Entfernen" a few pixels apart is a thing to misclick,
            and this is the one that cannot be taken back. */}
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending || !ready}
          className="rounded bg-[var(--danger-fg)] px-3 py-2 text-[14px] text-[var(--bg)] disabled:opacity-40"
        >
          {t('removeConfirm')}
        </button>
      </div>
    </div>
  )
}
