import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { currentOperator } from '@/cloud/operator/session'
import { PasskeyButton } from '../passkey-button'
import { MailLinkForm } from '../mail-link-form'

export default async function OperatorLogin() {
  if (await currentOperator()) redirect('/operator' as never)
  const t = await getTranslations('operator.signIn')
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-1 mb-6 text-[15px] text-[var(--fg-muted)]">{t('intro')}</p>
      <PasskeyButton />
      <MailLinkForm />
    </div>
  )
}
