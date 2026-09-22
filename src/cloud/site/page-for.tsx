import { Compare } from './compare'
import { Faq } from './faq'
import { Home } from './home'
import { LegalPage } from './legal-page'
import { Methods } from './methods'
import { Pricing } from './pricing'
import type { SitePage } from './routes'

/**
 * Which component answers which page.
 *
 * It exists so that the prefixed routes -- one file for nine pages in three
 * languages -- and the unprefixed German ones render literally the same tree.
 * Anything else and a section added to a page would appear in three languages
 * and not in the fourth, which is the sort of difference nobody reviews.
 */
export function SitePageBody({ page }: { page: SitePage }) {
  switch (page) {
    case 'home':
      return <Home />
    case 'pricing':
      return <Pricing />
    case 'methods':
      return <Methods />
    case 'compare':
      return <Compare />
    case 'faq':
      return <Faq />
    // The four legal texts differ only in which Markdown file they read.
    default:
      return <LegalPage document={page} />
  }
}
