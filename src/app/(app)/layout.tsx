import { redirect } from 'next/navigation'
import Link from 'next/link'
import { NextIntlClientProvider } from 'next-intl'
import { Fingerprint, KeyRound, LogOut, Mail, Palette, Users } from 'lucide-react'
import { AppFooter } from '@/components/layout/app-footer'
import { BrandMark, BrandStyle } from '@/components/layout/tenant-brand'
import { getTranslations } from 'next-intl/server'
import { getClientMessages } from '@/i18n/client-messages'
import { readSessionCached } from '@/server/auth/session'

export const dynamic = 'force-dynamic'

/**
 * Everything behind a session lives here.
 *
 * The check is in the layout rather than in each page: a route added next month
 * is protected because of where it sits, not because somebody remembered to
 * add a guard.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await readSessionCached()
  if (!session) redirect('/login')

  // Not in the root layout: src/app/print/layout.tsx nests inside that one, and
  // the print view deliberately ships no client JavaScript at all.
  const [messages, t] = await Promise.all([getClientMessages(), getTranslations('nav')])

  return (
    <div className="flex min-h-dvh flex-col">
      <BrandStyle />
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-1 px-4 py-2.5 sm:gap-4">
          <Link href="/library" className="flex items-center">
            <BrandMark />
          </Link>
          {session.tenantRole === 'admin' && (
            <Link
              href="/admin/branding"
              aria-label={t('branding')}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
            >
              <Palette aria-hidden className="size-4" />
              <span className="hidden sm:inline">{t('branding')}</span>
            </Link>
          )}
          {session.tenantRole === 'admin' && (
            <Link
              href="/admin/members"
              aria-label={t('members')}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
            >
              <Users aria-hidden className="size-4" />
              <span className="hidden sm:inline">{t('members')}</span>
            </Link>
          )}
          {session.tenantRole === 'admin' && (
            <Link
              href="/admin/mail"
              aria-label={t('mail')}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
            >
              <Mail aria-hidden className="size-4" />
              <span className="hidden sm:inline">{t('mail')}</span>
            </Link>
          )}
          <span className="flex-1" />
          <Link
            href="/settings/passkeys"
            aria-label={t('passkeys')}
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
          >
            <Fingerprint aria-hidden className="size-4" />
            <span className="hidden sm:inline">{t('passkeys')}</span>
          </Link>
          <Link
            href="/settings/tokens"
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
          >
            <KeyRound aria-hidden className="size-4" />
            <span className="hidden sm:inline">{t('tokens')}</span>
          </Link>
          {/* The account entry point. It was a dead <span>; the header already
              carries eight controls, so the language switcher went behind this
              rather than becoming a ninth. */}
          <Link
            href="/settings"
            className="hidden rounded px-2 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)] sm:inline"
          >
            {session.displayName || session.email}
          </Link>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              aria-label={t('signOut')}
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
            >
              <LogOut aria-hidden className="size-4" />
              <span className="hidden sm:inline">{t('signOut')}</span>
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </main>
      <AppFooter />
    </div>
  )
}
