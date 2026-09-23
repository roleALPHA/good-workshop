import Link from 'next/link'
import type { Route } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { operatorDb } from '@/cloud/operator/db'
import { listCatalogMethods } from '@/cloud/operator/catalog'
import { currentOperator } from '@/cloud/operator/session'
import { MethodForm } from './method-form'

/**
 * One method, in four languages at once.
 *
 * Side by side and not behind tabs: a translator needs the English and the
 * language they are writing in view together, and a tab puts a mode between
 * them. Four columns is also what makes "this one has no French summary"
 * visible without looking anything up.
 */
export const dynamic = 'force-dynamic'

type Method = {
  id: string
  key: string
  moduleTypeKey: string
  defaultDurationMinutes: number
  groupSize: string
  facets: string[]
  text: Record<
    string,
    { slug?: string | null; published?: boolean; fields?: Record<string, string> }
  >
}

export default async function MethodPage({ params }: { params: Promise<{ methodId: string }> }) {
  const operator = await currentOperator()
  if (!operator) redirect('/operator/login' as never)

  const [{ methodId }, t] = await Promise.all([params, getTranslations('operator.discover')])
  const [method] = (await listCatalogMethods(operatorDb(), methodId)) as Method[]
  if (!method) notFound()

  return (
    <div className="max-w-4xl">
      <p className="text-[14px]">
        <Link href={'/operator/discover' as Route} className="underline underline-offset-2">
          {t('back')}
        </Link>
      </p>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">{method.key}</h1>
      <MethodForm method={method} />
    </div>
  )
}
