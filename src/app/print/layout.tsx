import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import '@/styles/globals.css'
import '@/styles/print.css'

/**
 * Outside the app shell on purpose: no navigation, no drag context, and no
 * editor JavaScript at all. Descriptions are rendered on the server, so this
 * route ships nothing that could reflow the page while somebody is printing it.
 *
 * A thing to know before editing the tags below: there is no (print) route
 * group, so this layout NESTS inside src/app/layout.tsx and these <html> and
 * <body> merge into the ones already open. The HTML parser folds a nested start
 * tag's attributes onto the existing element and keeps only those NOT already
 * set. That is why `className` here reaches the real <body> (the root sets
 * none) -- and why a `lang` here would be silently discarded, because the root
 * already sets one from the resolved locale.
 *
 * So there is deliberately no lang attribute. Adding one back would look
 * correct, do nothing, and leave the print view claiming German to a screen
 * reader while the application renders Spanish. e2e/locale.spec.ts pins the
 * real behaviour so this cannot regress quietly.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta')
  return { title: t('printTitle') }
}

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body className="gw-print">{children}</body>
    </html>
  )
}
