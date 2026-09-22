import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { currentOperator } from '@/cloud/operator/session'
import { PasskeyButton } from '../passkey-button'
import { MailLinkForm } from '../mail-link-form'

export default async function OperatorLogin({
  searchParams,
}: {
  searchParams: Promise<{ link?: string }>
}) {
  if (await currentOperator()) redirect('/operator' as never)
  const [t, { link }] = await Promise.all([getTranslations('operator.signIn'), searchParams])
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-1 mb-6 text-[15px] text-[var(--fg-muted)]">{t('intro')}</p>

      {/* A link that was already used, or has run out. Said here rather than on
          an error page: whoever follows it has just asked for it. */}
      {link === 'invalid' && (
        <p role="alert" className="mb-4 text-[15px] text-[var(--warn-fg)]">
          {t('linkInvalid')}
        </p>
      )}
      <PasskeyButton />
      <MailLinkForm />
    </div>
  )
}
