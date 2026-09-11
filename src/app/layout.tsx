import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { ThemeProvider } from '@/components/theme-provider'
import '@/styles/globals.css'

export const metadata: Metadata = {
  title: {
    default: 'GoodWorkshop',
    template: '%s · GoodWorkshop',
  },
  description: 'Open-Source-Workshopplanung. Selbst gehostet, MCP-fähig.',
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
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html lang="de" suppressHydrationWarning>
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
