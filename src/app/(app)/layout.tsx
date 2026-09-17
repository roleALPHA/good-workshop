import { redirect } from 'next/navigation'
import Link from 'next/link'
import { NextIntlClientProvider } from 'next-intl'
import { AppFooter } from '@/components/layout/app-footer'
import { BrandMark, BrandStyle } from '@/components/layout/tenant-brand'
import { ProfileMenu } from '@/components/layout/profile-menu'
import { getClientMessages } from '@/i18n/client-messages'
import { readSessionCached } from '@/server/auth/session'
import { edition } from '@/server/edition'
import { WorkspaceNoticeBanner } from '@/components/layout/workspace-notice'

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
  const [messages, notice] = await Promise.all([
    getClientMessages(),
    edition.workspaceNotice(session.tenantId).catch(() => null),
  ])

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="flex min-h-dvh flex-col">
        <BrandStyle />
        <header className="border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-1.5">
            <Link href="/library" className="flex items-center">
              <BrandMark />
            </Link>
            <span className="flex-1" />
            {/* Everything about your own account, and for admins the
                administration, sits behind your name. The header used to carry
                up to eight separate links; see profile-menu.tsx. */}
            <ProfileMenu
              name={session.displayName}
              email={session.email}
              isAdmin={session.tenantRole === 'admin'}
              hasBilling={edition.hasBilling}
            />
          </div>
        </header>
        {notice && (
          <WorkspaceNoticeBanner notice={notice} isAdmin={session.tenantRole === 'admin'} />
        )}

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
        <AppFooter />
      </div>
    </NextIntlClientProvider>
  )
}
