import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import createNextIntlPlugin from 'next-intl/plugin'
import type { NextConfig } from 'next'
import { requestedEdition } from './scripts/edition.mjs'
import { billingAdaptersPath, catalogPath } from './scripts/edition-aliases.mjs'

/**
 * Which edition this build is. Read from the build environment here and in
 * scripts/build-collab.mjs, which also records it for migrate and provision --
 * see scripts/edition.mjs for why it is never a runtime switch.
 */
const edition = requestedEdition()

/**
 * The website's German addresses, from before English became the unprefixed
 * language (src/cloud/site/routes.ts explains the change).
 *
 * Permanent, and that is the whole point: these five are in sent mails, in the
 * legal footer of every page § 5 ECG requires, and in whatever a search engine
 * has already indexed. A 301 keeps every one of those links working and hands
 * what it is worth to the new address; a 404 would throw both away.
 *
 * `/faq` is deliberately absent. It is English now, and it never existed as a
 * German address, so there is nothing to redirect and a rule here would break
 * the page it points away from.
 *
 * `/en` is the mirror case: English has no prefix, so the address is not a
 * page -- but it is the first thing somebody types who has seen `/de` or
 * `/fr`, and sending them to the front page is kinder than a 404.
 */
const websiteRedirects = [
  { source: '/preise', destination: '/de/preise', permanent: true },
  { source: '/impressum', destination: '/de/impressum', permanent: true },
  { source: '/agb', destination: '/de/agb', permanent: true },
  { source: '/datenschutz', destination: '/de/datenschutz', permanent: true },
  { source: '/avv', destination: '/de/avv', permanent: true },
  { source: '/en', destination: '/', permanent: true },
  { source: '/en/:path*', destination: '/:path*', permanent: true },
]

const nextConfig: NextConfig = {
  // Single self-contained artifact for the on-prem Docker image.
  output: 'standalone',

  // Pinned rather than inferred. Next guesses the workspace root from the
  // nearest lockfile, and in a git worktree (or any checkout under another
  // project) it guesses wrong -- the traced bundle then lands somewhere else
  // and `.next/standalone` comes out holding nothing but a package.json.
  // Inside the Docker image there is only one lockfile, so the failure is
  // invisible exactly where it would hurt most to discover it late.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
  /**
   * One copy of Yjs in the process, not one per chunk.
   *
   * The editor bundle and the MCP route both reach for it, and two bundled
   * copies mean two different Y.Doc classes: y-protocols checks instances, so
   * a document created by one copy silently fails to sync through the other.
   * Yjs prints "Yjs was already imported" when this happens -- a warning that
   * describes a real, subtle breakage rather than noise. `ws` is here because
   * it is a native-ish server library with no business in a bundle.
   */
  serverExternalPackages: ['yjs', 'y-protocols', 'lib0', 'ws'],

  reactStrictMode: true,
  poweredByHeader: false,

  turbopack: {
    resolveAlias: {
      '@gw/edition': `./src/server/edition/${edition}.ts`,
      // The private cloud build points this at the real accounting and payment
      // adapters; every other build refuses to bill.
      '@gw/billing-adapters': billingAdaptersPath(
        process.env,
        './src/cloud/billing/adapters/unavailable.ts',
      ),
      '@gw/home':
        edition === 'cloud'
          ? './src/cloud/site/home.tsx'
          : './src/components/home/community-home.tsx',
      // The Discover catalogue. The private cloud build points this at the real
      // one; every other build gets a catalogue with nothing in it -- which is
      // a state the screens have to render anyway, so it is not an error path.
      '@gw/catalog': catalogPath(process.env, './src/cloud/catalog/unavailable.ts'),
    },
  },

  // The cloud's website -- pricing, legal texts, registration -- lives in
  // `page.cloud.tsx` files. Only a cloud build counts them as routes; in a
  // community build they are ordinary modules nothing imports, and the routes
  // do not exist.
  pageExtensions: edition === 'cloud' ? ['cloud.tsx', 'cloud.ts', 'tsx', 'ts'] : ['tsx', 'ts'],

  // Read from disk at request time (src/cloud/legal/documents.ts), so they have
  // to be named for the standalone output to carry them.
  ...(edition === 'cloud'
    ? { outputFileTracingIncludes: { '/*': ['./src/cloud/legal/*.md'] } }
    : {}),

  /**
   * The two settings pages were renamed from what they are made of to what they
   * are for: "Passkeys" became Security, "Token" became AI Connection. The old
   * addresses live on in bookmarks, in the README of older releases and in
   * OAuth metadata that a client may have cached, so they keep working.
   */
  async redirects() {
    return [
      { source: '/settings/passkeys', destination: '/settings/security', permanent: true },
      { source: '/settings/tokens', destination: '/settings/ai-connection', permanent: true },
      ...(edition === 'cloud' ? websiteRedirects : []),
    ]
  },
  typedRoutes: true,
}

/**
 * Required even though this application has no locale routing.
 *
 * The plugin's job here is to alias `next-intl/config` to the request file
 * below; without it `getTranslations()` and `getLocale()` in a Server Component
 * have no configuration and throw. What "without i18n routing" removes is the
 * middleware and the [locale] segment -- not this.
 *
 * `createMessagesDeclaration` types every message key off the German catalog,
 * which turns a typo into a compile error instead of a string that renders as
 * its own key in production.
 */
const withNextIntl = createNextIntlPlugin({
  requestConfig: './src/i18n/request.ts',
  experimental: { createMessagesDeclaration: './src/messages/de.json' },
})

export default withNextIntl(nextConfig)
