'use client'

import { useState } from 'react'
import { leaveGuestAccess } from './actions'

/**
 * Ends this browser's guest session.
 *
 * Not "sign out": there is no account to sign out of, and the invitation stays
 * valid -- the same link and the same address open it again. What this clears is
 * the cookie on a machine somebody is handing back, which is the reason a shared
 * laptop in a workshop room needs it at all.
 */
export function LeaveGuestAccess({ label }: { label: string }) {
  const [pending, setPending] = useState(false)

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        setPending(true)
        void leaveGuestAccess()
      }}
      className="rounded border border-[var(--border-strong)] px-2.5 py-1.5 text-[14px] hover:bg-[var(--surface-raised)] disabled:opacity-60"
    >
      {label}
    </button>
  )
}
