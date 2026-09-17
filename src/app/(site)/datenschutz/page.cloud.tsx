import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { LegalPage } from '@/cloud/site/legal-page'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.nav')
  return { title: t('datenschutz') }
}

export default function Page() {
  return <LegalPage document="datenschutz" />
}
