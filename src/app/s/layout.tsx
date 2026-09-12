import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { AppFooter } from '@/components/layout/app-footer'
import { BrandMark, BrandStyle } from '@/components/layout/tenant-brand'
import { getClientMessages } from '@/i18n/client-messages'

export const dynamic = 'force-dynamic'

/**
 * The guest area: one shared agenda, and no way out of it.
 *
 * Outside `(app)` on purpose, the way `print/` is. That layout redirects anybody
 * without a member session to /login -- correct for everything inside it, and
 * exactly wrong here. It also carries the shell a guest must not be offered:
 * the library, the folders, branding, members, mail, tokens, passkeys.
 *
 * What is missing from this header is the point of it. The wordmark is NOT a link
 * to /library. There is no navigation at all, because there is nothing a guest
 * may navigate to: the only thing they can reach is the day tabs of the one
 * workshop their invitation names, and those are rendered by the page.
 *
 * `robots: noindex` because these pages hang off a link sent by mail. The token
 * form at /s/<token> shows nothing without the right address, but a crawler has
 * no business in a workshop's agenda either way.
 *
 * A NextIntlClientProvider is here and not in print/, because a guest invited to
 * write gets the real editor, and the editor is a client island that translates.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function GuestLayout({ children }: { children: React.ReactNode }) {
  const messages = await getClientMessages()

  return (
    <div className="flex min-h-dvh flex-col">
      <BrandStyle />
      <header className="border-b border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-4 px-4 py-2.5">
          <BrandMark />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
      </main>
      <AppFooter />
    </div>
  )
}
