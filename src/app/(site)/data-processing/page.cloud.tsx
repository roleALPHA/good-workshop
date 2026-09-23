import type { Metadata } from 'next'
import { siteMetadata } from '@/cloud/site/metadata'
import { SitePageBody } from '@/cloud/site/page-for'

/**
 * English is served without a prefix, so it has a file of its own; the other
 * three languages reach the same component through
 * src/app/(site)/[lang]/[slug]. The directory this route is named after is the
 * English entry in src/cloud/site/routes.ts, and the two have to agree --
 * src/cloud/site/seo.test.ts is where that is checked.
 */
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return siteMetadata('avv')
}

export default function Page() {
  return <SitePageBody page="avv" />
}
