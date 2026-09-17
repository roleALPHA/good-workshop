'use client'

import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bot, Fingerprint, LogOut, Mail, Palette, Receipt, UserRound, Users } from 'lucide-react'
import { initials } from '@/domain/agenda/responsible'

/**
 * Everything about your own account, behind your name in the top right.
 *
 * The header used to carry up to eight links side by side -- three of them for
 * admins only -- and on a phone most of them were icons without a word. One
 * button with a list is what people expect in that corner, and it scales: a
 * tenant admin sees an extra section, nobody sees a longer header.
 *
 * A disclosure, not an ARIA menu. The entries are links and one sign-out form;
 * `role="menu"` would promise arrow-key navigation and menuitem semantics that
 * screen readers then announce, for a list that is simply navigation. A button
 * with `aria-expanded` and a `<nav>` of links says exactly what it is.
 *
 * It closes the way ParticipationControl does, and for the same reason: on a
 * pointer going down outside it, or on a focus-out that NAMES somewhere
 * outside. iOS Safari does not focus a tapped link or button, so an
 * unattributable focus-out is a tap in progress -- closing on it would unmount
 * the link under the finger. See docs/ui-conventions.md.
 */
export function ProfileMenu({
  name,
  email,
  isAdmin,
  hasBilling = false,
}: {
  /** First and last name; '' for somebody who has none yet. */
  name: string
  email: string
  isAdmin: boolean
  /** The cloud: tenant admins also reach billing from here. */
  hasBilling?: boolean
}) {
  const t = useTranslations('nav')
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const label = name || email

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node | null)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open])

  // The keyboard lands on the first entry. `autoFocus` would not do it: React
  // honours it only on form controls, and these are links.
  useEffect(() => {
    if (open) panelRef.current?.querySelector<HTMLElement>('a[href]')?.focus()
  }, [open])

  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div
      ref={wrapperRef}
      className="relative"
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null
        if (next !== null && !e.currentTarget.contains(next)) setOpen(false)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.preventDefault()
          close()
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('account')}
        title={label}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 items-center gap-2 rounded px-1.5 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)] focus-visible:outline-2 focus-visible:outline-[var(--brand-ring)]"
      >
        <span
          aria-hidden
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-[13px] font-semibold text-[var(--brand-fg)]"
        >
          {initials(name || email)}
        </span>
        <span className="hidden max-w-48 truncate sm:inline">{label}</span>
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className="absolute top-full right-0 z-30 mt-1 w-[min(18rem,calc(100vw-2rem))] rounded border border-[var(--border-strong)] bg-[var(--surface-raised)] p-1 shadow-lg"
        >
          <div className="border-b border-[var(--border)] px-3 py-2">
            {name && <p className="truncate text-[15px] font-medium text-[var(--fg)]">{name}</p>}
            <p className="truncate text-[13px] text-[var(--fg-muted)]">{email}</p>
          </div>

          <nav aria-label={t('account')}>
            <ul className="py-1">
              <Entry href="/settings" icon={UserRound} onPick={() => setOpen(false)}>
                {t('profile')}
              </Entry>
              <Entry href="/settings/security" icon={Fingerprint} onPick={() => setOpen(false)}>
                {t('security')}
              </Entry>
              <Entry href="/settings/ai-connection" icon={Bot} onPick={() => setOpen(false)}>
                {t('aiConnection')}
              </Entry>
            </ul>
          </nav>

          {isAdmin && (
            <nav
              aria-labelledby={`${panelId}-admin`}
              className="border-t border-[var(--border)] pt-1"
            >
              <p
                id={`${panelId}-admin`}
                className="px-3 pt-1 pb-0.5 text-[12px] font-medium tracking-wide text-[var(--fg-subtle)] uppercase"
              >
                {t('administration')}
              </p>
              <ul className="pb-1">
                <Entry href="/admin/members" icon={Users} onPick={() => setOpen(false)}>
                  {t('members')}
                </Entry>
                <Entry href="/admin/branding" icon={Palette} onPick={() => setOpen(false)}>
                  {t('branding')}
                </Entry>
                <Entry href="/admin/mail" icon={Mail} onPick={() => setOpen(false)}>
                  {t('mail')}
                </Entry>
                {hasBilling && (
                  <Entry href="/admin/billing" icon={Receipt} onPick={() => setOpen(false)}>
                    {t('billing')}
                  </Entry>
                )}
              </ul>
            </nav>
          )}

          <form
            action="/api/auth/logout"
            method="post"
            className="border-t border-[var(--border)] pt-1"
          >
            <button
              type="submit"
              className="flex min-h-11 w-full items-center gap-2.5 rounded px-3 text-left text-[15px] text-[var(--fg-muted)] hover:bg-[var(--surface)] focus-visible:bg-[var(--surface)] focus-visible:outline-none"
            >
              <LogOut aria-hidden className="size-4 shrink-0" />
              {t('signOut')}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

function Entry({
  href,
  icon: Icon,
  onPick,
  children,
}: {
  href: '/settings' | '/settings/security' | '/settings/ai-connection' | `/admin/${string}`
  icon: typeof UserRound
  onPick: () => void
  children: React.ReactNode
}) {
  return (
    <li>
      <Link
        href={href as '/settings'}
        onClick={onPick}
        className="flex min-h-11 items-center gap-2.5 rounded px-3 text-[15px] text-[var(--fg)] hover:bg-[var(--surface)] focus-visible:bg-[var(--surface)] focus-visible:outline-none"
      >
        <Icon aria-hidden className="size-4 shrink-0 text-[var(--fg-muted)]" />
        {children}
      </Link>
    </li>
  )
}
