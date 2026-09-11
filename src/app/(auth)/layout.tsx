import { NextIntlClientProvider } from 'next-intl'
import { AppFooter } from '@/components/layout/app-footer'
import { BrandMark, BrandStyle } from '@/components/layout/tenant-brand'
import { LanguageSwitcher } from '@/components/settings/language-switcher'
import { getClientMessages } from '@/i18n/client-messages'

// The sign-in page reads the tenant row for its branding, so it cannot be
// prerendered. That is the right trade: a login page that shows the default
// palette for a moment and then swaps to somebody's brand looks broken.
export const dynamic = 'force-dynamic'

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const messages = await getClientMessages()

  return (
    <div className="flex min-h-dvh flex-col">
      <BrandStyle />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex justify-center">
            <BrandMark className="h-8 w-auto max-w-56 object-contain" />
          </div>
          <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        </div>
      </main>
      {/* Here rather than only in /settings, because this is the one screen
          somebody reaches before they have an account to hold a preference --
          and a login page you cannot read is the end of the road. */}
      <div className="flex justify-center px-4 pb-4">
        <LanguageSwitcher compact />
      </div>
      <AppFooter />
    </div>
  )
}
