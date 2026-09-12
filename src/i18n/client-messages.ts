import { getMessages } from 'next-intl/server'
import { CLIENT_NAMESPACES } from './config'

/**
 * The slice of the catalog that is worth sending to a browser.
 *
 * `NextIntlClientProvider` rendered from a Server Component inherits the whole
 * active catalog if you hand it nothing, which would put the Markdown
 * exporter's column headers, the mail templates and the module-type catalog
 * into every page's payload -- none of which a browser ever formats.
 *
 * This is one line of lever rather than a per-route subsetting machine: at the
 * current size the difference is a few kilobytes, and building route-level
 * splitting for that would be the wrong trade. When the catalog is ten times
 * larger, this is where to start.
 */
export async function getClientMessages(): Promise<Record<string, unknown>> {
  const messages = (await getMessages()) as Record<string, unknown>
  const picked: Record<string, unknown> = {}
  for (const namespace of CLIENT_NAMESPACES) {
    if (namespace in messages) picked[namespace] = messages[namespace]
  }
  return picked
}
