import type { Metadata, Viewport } from 'next'
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
