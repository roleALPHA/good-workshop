import Link from 'next/link'
import type { Route } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { operatorDb } from '@/cloud/operator/db'
import { listCatalogEntries } from '@/cloud/operator/catalog'
import { currentOperator } from '@/cloud/operator/session'
import { EntryForm } from './entry-form'

/**
 * One entry, in four languages at once.
 *
 * Side by side and not behind tabs: a translator needs the English and the
 * language they are writing in view together, and a tab puts a mode between
 * them. Four columns is also what makes "this one has no French summary"
 * visible without looking anything up.
 */
export const dynamic = 'force-dynamic'

export default async function EntryPage({ params }: { params: Promise<{ entryId: string }> }) {
  const operator = await currentOperator()
  if (!operator) redirect('/operator/login' as never)

  const [{ entryId }, t] = await Promise.all([params, getTranslations('operator.discover')])
  const [entry] = await listCatalogEntries(operatorDb(), entryId)
  if (!entry) notFound()

  return (
    <div className="max-w-4xl">
      <p className="text-[14px]">
        <Link href={'/operator/discover' as Route} className="underline underline-offset-2">
          {t('back')}
        </Link>
      </p>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">{entry.key}</h1>
      <EntryForm entry={entry} />
    </div>
  )
}
