'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { MemberRow } from '@/domain/tenant/members'
import { setMemberRoleAction, setMemberStatusAction } from '@/server/actions/members'

const STATUS: Record<MemberRow['status'], string> = {
  invited: 'Eingeladen',
  active: 'Aktiv',
  disabled: 'Abgeschaltet',
}

/**
 * The list, edited in place.
 *
 * Role and status are select and button right in the row -- no detail page, no
 * dialog. The refusals that matter ("that is the last admin") come back from
 * the server as sentences and are shown next to the row that caused them,
 * because a message at the top of the page about a row further down is a
 * message nobody connects to what they just did.
 */
export function MembersTable({ members }: { members: MemberRow[] }) {
  const router = useRouter()
  const [error, setError] = useState<{ memberId: string; message: string } | null>(null)
  const [pending, startTransition] = useTransition()

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
              {STATUS[person.status]}
            </span>

            <select
              aria-label={`Rolle von ${person.email}`}
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
              <option value="member">Mitglied</option>
              <option value="admin">Admin</option>
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
              {person.status === 'disabled' ? 'Wieder zulassen' : 'Abschalten'}
            </button>
          </div>

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
