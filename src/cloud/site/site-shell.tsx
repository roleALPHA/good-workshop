import Link from 'next/link'
import type { Route } from 'next'
import { getTranslations } from 'next-intl/server'
import { AppFooter } from '@/components/layout/app-footer'
import { LanguageSwitcher } from '@/components/settings/language-switcher'
import { Analytics } from './analytics'

/**
 * The frame around every page of the public website: the product mark, the way
 * to prices and in, and the legal links every page of an Austrian website has
 * to reach in one click (§ 5 ECG).
 *
 * Only in a cloud build. The routes that use it are `*.cloud.tsx` files, which a
 * community build does not treat as pages.
 */
export async function SiteShell({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('site.nav')

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--bg)]">
      {/* The public pages, and only those: the shell around the workspace is a
          different file, and nothing counts what people do with their own
          workshops. */}
      <Analytics />
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <nav className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href={'/' as Route} className="font-semibold tracking-tight">
            GoodWorkshop
          </Link>
          <span className="flex-1" />
          <Link
            href={'/preise' as Route}
            className="rounded px-2 py-2 text-[15px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
          >
            {t('pricing')}
          </Link>
          <Link
            href="/login"
            className="rounded px-2 py-2 text-[15px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
          >
            {t('signIn')}
          </Link>
          <Link
            href={'/registrieren' as Route}
            className="rounded bg-[var(--brand)] px-3 py-2 text-[15px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)]"
          >
            {t('register')}
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">{children}</main>

      <footer className="border-t border-[var(--border)]">
        <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 pt-4 text-[14px] text-[var(--fg-muted)]">
          <LegalLinks />
        </nav>
        <div className="flex justify-center px-4 pt-3">
          <LanguageSwitcher compact />
        </div>
        <AppFooter />
      </footer>
    </div>
  )
}

/** The legal pages, in the order people look for them. */
export async function LegalLinks() {
  const t = await getTranslations('site.nav')
  const links = [
    ['/impressum', t('impressum')],
    ['/agb', t('agb')],
    ['/datenschutz', t('datenschutz')],
    ['/avv', t('avv')],
  ] as const
  return (
    <>
      {links.map(([href, label]) => (
        <Link key={href} href={href as Route} className="py-2 underline-offset-2 hover:underline">
          {label}
        </Link>
      ))}
    </>
  )
}
