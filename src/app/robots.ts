import type { MetadataRoute } from 'next'
import { edition } from '@/server/edition'
import { siteUrl } from '@/cloud/site/metadata'

/**
 * What a crawler may read, and where the list of it is.
 *
 * A community build says no to everything, which is not caution but a
 * description: a self-hosted installation is entirely behind a login, and
 * every address a crawler could reach answers with a redirect. Saying so
 * costs one line and spares the operator a log full of fetches.
 *
 * In the cloud the disallow list is not about secrecy either -- everything on
 * it needs a session or a token. It is about crawl budget and about search
 * results: a few hundred thousand `/w/<uuid>/d/<uuid>` redirects fetched
 * instead of the nine pages that are meant to rank is a real cost, and
 * `/s/<token>` is somebody's agenda.
 *
 * `/registrieren` is allowed but carries `noindex` on the page itself: it is a
 * form, it is where every button on the site points, and a crawler should
 * follow those links without offering the form as a search result.
 */
export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  if (edition.name !== 'cloud') {
    return { rules: [{ userAgent: '*', disallow: '/' }] }
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          // Behind a session.
          '/library',
          '/discover',
          '/w/',
          '/f/',
          '/settings/',
          '/admin/',
          '/oauth/',
          '/operator',
          // Behind a token that arrives by mail.
          '/s/',
          '/verify',
          '/setup',
          '/registrieren/bestaetigen',
          // Not pages.
          '/api/',
          '/print/',
          '/.well-known/',
          // The sign-in form, which no search result should lead to.
          '/login',
        ],
      },
    ],
    sitemap: siteUrl('/sitemap.xml'),
  }
}
