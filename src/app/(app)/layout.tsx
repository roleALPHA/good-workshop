import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LogOut, Palette, Users } from 'lucide-react'
import { AppFooter } from '@/components/layout/app-footer'
import { BrandMark, BrandStyle } from '@/components/layout/tenant-brand'
import { readSession } from '@/server/auth/session'

export const dynamic = 'force-dynamic'

/**
 * Everything behind a session lives here.
 *
 * The check is in the layout rather than in each page: a route added next month
 * is protected because of where it sits, not because somebody remembered to
 * add a guard.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession()
  if (!session) redirect('/login')

  return (
    <div className="flex min-h-dvh flex-col">
      <BrandStyle />
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-2.5">
          <Link href="/library" className="flex items-center">
            <BrandMark />
          </Link>
          {session.tenantRole === 'admin' && (
            <Link
              href="/admin/branding"
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
            >
              <Palette aria-hidden className="size-4" />
              Branding
            </Link>
          )}
          {session.tenantRole === 'admin' && (
            <Link
              href="/admin/members"
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
            >
              <Users aria-hidden className="size-4" />
              Mitglieder
            </Link>
          )}
          <span className="flex-1" />
          <span className="hidden text-[14px] text-[var(--fg-muted)] sm:inline">
            {session.displayName || session.email}
          </span>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-[14px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
            >
              <LogOut aria-hidden className="size-4" />
              Abmelden
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      <AppFooter />
    </div>
  )
}
