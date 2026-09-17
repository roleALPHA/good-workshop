import { getTranslations } from 'next-intl/server'
import { operatorDb } from '@/cloud/operator/db'
import { peekEnrollment } from '@/cloud/operator/auth'
import { PasskeyButton } from '../passkey-button'

export default async function OperatorEnroll({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const t = await getTranslations('operator.signIn')
  const operator = token ? await peekEnrollment(operatorDb(), token) : null
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-xl font-semibold tracking-tight">{t('enrollTitle')}</h1>
      {operator && token ? (
        <>
          <p className="mt-1 mb-6 text-[15px] text-[var(--fg-muted)]">
            {t('enrollIntro', { email: operator.email })}
          </p>
          <PasskeyButton token={token} />
        </>
      ) : (
        <p role="alert" className="mt-4 text-[15px]">
          {t('enrollInvalid')}
        </p>
      )}
    </div>
  )
}
