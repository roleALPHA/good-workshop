import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { getLocale, getTranslations } from 'next-intl/server'
import { ThemeProvider } from '@/components/theme-provider'
import '@/styles/globals.css'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return {
    // The product name, not a string: it is the same in every language and is
    // not interpolated from tenant data. Same rule as <AppFooter>.
    title: {
      default: 'GoodWorkshop',
      template: '%s · GoodWorkshop',
    },
    description: t('description'),
  }
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Never lock zoom: pinch-to-zoom is an accessibility feature, and the
  // reading view is meant to be used on a phone in a real room.
  maximumScale: 5,
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // next-themes writes an inline <script> to set the class before first paint.
  // Under the CSP from src/middleware.ts that script needs the request's nonce,
  // or it is blocked and every visitor gets a flash of the wrong theme.
  const [headerList, locale] = await Promise.all([headers(), getLocale()])
  const nonce = headerList.get('x-nonce') ?? undefined

  return (
    // The only <html lang> in the tree. src/app/print/layout.tsx nests inside
    // this one, so the print view inherits this attribute -- see the comment
    // there.
    <html lang={locale} suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
