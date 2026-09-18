import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Pricing } from '@/cloud/site/pricing'

// The prices come from the database, so this page is rendered per request. Left
// to itself Next would try to prerender it at build time -- where there is no
// database -- and a page that came out of that would show whatever it found
// then, for as long as it is cached.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.pricing')
  return { title: t('title') }
}

export default function PricingPage() {
  return <Pricing />
}
