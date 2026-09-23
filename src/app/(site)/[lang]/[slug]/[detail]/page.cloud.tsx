import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Method } from '@/cloud/site/method'
import { methodMetadata } from '@/cloud/site/metadata'
import { pageForPath } from '@/cloud/site/routes'

/**
 * One method in German, French or Spanish.
 *
 * The address is resolved through the route table rather than trusted: the
 * middle segment has to be the methods directory in THIS language, or
 * `/de/preise/anything` would render a method page under a pricing address.
 */
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ lang: string; slug: string; detail: string }> }

async function slugOf({ params }: Props): Promise<string> {
  const { lang, slug, detail } = await params
  const match = pageForPath(`/${lang}/${slug}/${detail}`)
  if (!match?.detail) notFound()
  return match.detail
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  return methodMetadata(await slugOf(props))
}

export default async function Page(props: Props) {
  return <Method slug={await slugOf(props)} />
}
