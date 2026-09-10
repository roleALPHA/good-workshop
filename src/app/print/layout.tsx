import '@/styles/globals.css'
import '@/styles/print.css'

/**
 * Outside the app shell on purpose: no navigation, no providers, no drag
 * context, and no editor JavaScript at all. Descriptions are rendered on the
 * server, so this route ships nothing that could reflow the page while
 * somebody is printing it.
 */
export const metadata = { title: 'Druckansicht' }

export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="gw-print">{children}</body>
    </html>
  )
}
