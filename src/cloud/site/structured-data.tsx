import { headers } from 'next/headers'
import { ROLEALPHA_URL, SOURCE_URL } from '@/lib/attribution'
import type { Locale } from '@/i18n/config'
import { siteUrl } from './metadata'
import { alternatesFor, pathFor, type SitePage } from './routes'

/**
 * What the page says about itself to a machine.
 *
 * Schema.org is how a search engine gets a price, a rating or a question out
 * of a page without reading the prose around it, and it is what a rich result
 * is built from. It is also the easiest thing in SEO to get wrong invisibly,
 * so two rules hold here:
 *
 *  1. Nothing is stated that the page does not also show a reader. Markup that
 *     describes a page other than the one it sits on is the definition of
 *     structured-data spam, and the penalty is manual.
 *  2. Every value comes from the same source the page renders from -- the
 *     price list, the catalog, the route table -- never a second copy.
 */

/**
 * The nonce is not optional here.
 *
 * `script-src` in src/middleware.ts carries a per-response nonce and no
 * 'unsafe-inline', so an inline <script> without it is blocked by the browser
 * -- and a blocked JSON-LD block is exactly as absent as one nobody wrote,
 * with nothing in the page to show for it.
 */
export async function JsonLd({ data }: { data: object }) {
  const nonce = (await headers()).get('x-nonce') ?? undefined
  return (
    <script
      type="application/ld+json"
      nonce={nonce}
      // Escaped, because this is a <script> whose content is JSON: a "</script>"
      // arriving in any string below would otherwise end the element early.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replaceAll('<', String.raw`<`) }}
    />
  )
}

/** The company behind it, said once and referred to by @id from everything else. */
export function organization() {
  return {
    '@type': 'Organization',
    '@id': siteUrl('/#organization'),
    name: 'roleALPHA GmbH',
    url: ROLEALPHA_URL,
    sameAs: [SOURCE_URL],
  }
}

/**
 * The product, with the prices the pricing page shows and nothing else.
 *
 * `offers` is left out where the numbers are not in hand: an offer that names
 * a price the page does not is the mistake rule 1 above exists to prevent, and
 * the price list is read from the accounting system and can be unavailable.
 */
export function softwareApplication({
  locale,
  name,
  description,
  offers,
}: {
  locale: Locale
  name: string
  description: string
  offers?: { price: number; unit: string }[]
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    '@id': siteUrl('/#software'),
    name,
    description,
    url: siteUrl(pathFor('home', locale)),
    applicationCategory: 'BusinessApplication',
    applicationSubCategory: 'Workshop and facilitation planning',
    operatingSystem: 'Web browser',
    inLanguage: Object.keys(alternatesFor('home').languages),
    publisher: organization(),
    ...(offers && offers.length > 0
      ? {
          offers: offers.map(({ price, unit }) => ({
            '@type': 'Offer',
            price: price.toFixed(2),
            priceCurrency: 'EUR',
            // The page says "net, plus VAT" before it says anything else, and
            // so does this.
            valueAddedTaxIncluded: false,
            description: unit,
            url: siteUrl(pathFor('pricing', locale)),
          })),
        }
      : {}),
  }
}

/** A list of questions, each with the answer the page actually prints. */
export function faqPage(entries: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: entries.map(({ question, answer }) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: { '@type': 'Answer', text: answer },
    })),
  }
}

/** The named things on a page, in the order the page shows them. */
export function itemList(name: string, items: { name: string; description?: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      ...(item.description ? { description: item.description } : {}),
    })),
  }
}

/**
 * Where a page sits, for the trail under a search result.
 *
 * Two levels, because that is how deep this website is. Inventing a middle
 * level to make the trail look richer would describe a structure that has no
 * page behind it.
 */
export function breadcrumb(page: SitePage, locale: Locale, title: string, home: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: home, item: siteUrl(pathFor('home', locale)) },
      { '@type': 'ListItem', position: 2, name: title, item: siteUrl(pathFor(page, locale)) },
    ],
  }
}
