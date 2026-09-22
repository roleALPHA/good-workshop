import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { siteMetadata } from '@/cloud/site/metadata'
import { SitePageBody } from '@/cloud/site/page-for'
import { pageForPath, type SitePage } from '@/cloud/site/routes'

/**
 * Every page of the website that is not the front page, in every language
 * that has a prefix.
 *
 * One route rather than eight directories times three languages, because the
 * slugs are translated -- `/fr/tarifs`, not `/fr/preise` -- and a static file
 * tree would have to spell out twenty-four of them. The route table is asked
 * instead, so a slug is changed in one place and the sitemap, the canonical
 * and the hreflang block change with it.
 *
 * Unknown slugs are a 404 rather than a redirect to the front page: a soft 404
 * is a page that returns 200 with nothing on it, and it is the reason indexes
 * fill up with addresses that were never real.
 */
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ lang: string; slug: string }> }

async function resolved({ params }: Props): Promise<SitePage> {
  const { lang, slug } = await params
  const match = pageForPath(`/${lang}/${slug}`)
  // 'home' has no slug, so a match on it means the address was built by hand.
  if (!match || match.page === 'home') notFound()
  return match.page
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  return siteMetadata(await resolved(props))
}

export default async function LocalisedPage(props: Props) {
  return <SitePageBody page={await resolved(props)} />
}
