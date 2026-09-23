import type { Metadata } from 'next'
import { Method } from '@/cloud/site/method'
import { methodMetadata } from '@/cloud/site/metadata'

/**
 * One method in English, which is the language served without a prefix. The
 * other three reach the same component through
 * src/app/(site)/[lang]/[slug]/[detail].
 */
export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return methodMetadata((await params).slug)
}

export default async function Page({ params }: Props) {
  return <Method slug={(await params).slug} />
}
