import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations } from 'next-intl/server'
import type { AbstractIntlMessages } from 'next-intl'
import { peekSignup } from '@/cloud/registration/signup'
import { ConfirmSignup } from './confirm-signup'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { robots: { index: false, follow: false } }

export default async function ConfirmSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const [t, messages] = await Promise.all([
    getTranslations('site.confirm'),
    getMessages() as Promise<{ site: { confirm: AbstractIntlMessages } }>,
  ])
  const valid = token ? await peekSignup(token) : false

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      {valid && token ? (
        <>
          <p className="mt-2 text-[17px] text-[var(--fg-muted)]">{t('intro')}</p>
          <NextIntlClientProvider messages={{ site: { confirm: messages.site.confirm } }}>
            <ConfirmSignup token={token} />
          </NextIntlClientProvider>
        </>
      ) : (
        <p role="alert" className="mt-4 text-[15px]">
          {t('invalid')}{' '}
          <a href="/registrieren" className="underline underline-offset-2">
            →
          </a>
        </p>
      )}
    </div>
  )
}
