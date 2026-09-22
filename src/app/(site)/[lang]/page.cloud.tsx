import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { isLocale } from '@/i18n/config'
import { Home, sendMembersToTheirLibrary } from '@/cloud/site/home'
import { siteMetadata } from '@/cloud/site/metadata'
import { SITE_PRIMARY_LOCALE } from '@/cloud/site/routes'

/**
 * The front page in German, French and Spanish.
 *
 * English is not here: it answers `/` without a prefix, through
 * src/app/page.tsx. `/en` is therefore not a page -- two addresses for one
 * text is the duplicate this whole structure exists to avoid -- and
 * next.config.ts redirects it to `/` rather than leaving somebody who typed it
 * at a 404.
 *
 * The language itself is not read here. src/middleware.ts has already pinned
 * it from the address, so `getTranslations()` inside the tree answers in the
 * language of the URL; the parameter is only checked, never used.
 */
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ lang: string }> }

async function checked({ params }: Props) {
  const { lang } = await params
  if (!isLocale(lang) || lang === SITE_PRIMARY_LOCALE) notFound()
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  await checked(props)
  return siteMetadata('home')
}

export default async function LocalisedHome(props: Props) {
  await checked(props)
  await sendMembersToTheirLibrary()
  return <Home />
}
