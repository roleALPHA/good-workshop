import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { Pricing } from '@/cloud/site/pricing'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.pricing')
  return { title: t('title') }
}

export default function PricingPage() {
  return <Pricing />
}
