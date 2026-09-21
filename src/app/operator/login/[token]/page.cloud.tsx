import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { operatorConsoleEnabled, operatorDb } from '@/cloud/operator/db'
import { spendSignInLink } from '@/cloud/operator/auth'
import { startOperatorSession } from '@/cloud/operator/session'

/**
 * The link from the mail: spent here, and the session starts.
 *
 * A page rather than a route handler, so a refused link says why instead of
 * dropping somebody on a blank error. The token is spent by the database in
 * one statement, so a link opened twice -- by a mail client that fetches it
 * and a person who then clicks it -- signs in once.
 */
export default async function OperatorMailLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!operatorConsoleEnabled()) redirect('/operator/login' as never)

  const operator = await spendSignInLink(operatorDb(), token)
  if (operator) {
    await startOperatorSession(operator.id)
    redirect('/operator' as never)
  }

  const t = await getTranslations('operator.signIn')
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
      <p role="alert" className="mt-2 text-[15px] text-[var(--warn-fg)]">
        {t('linkInvalid')}
      </p>
      <a href="/operator/login" className="mt-4 inline-block text-[15px] underline">
        {t('button')}
      </a>
    </div>
  )
}
