import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations } from 'next-intl/server'
import type { AbstractIntlMessages } from 'next-intl'
import { readPriceList } from '@/cloud/billing/price-list'
import { readSessionCached } from '@/server/auth/session'
import { RegisterForm } from './register-form'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.register')
  return { title: t('title') }
}

export default async function RegisterPage() {
  if (await readSessionCached().catch(() => null)) redirect('/library')

  const [t, messages, priceList] = await Promise.all([
    getTranslations('site.register'),
    getMessages() as Promise<{ site: { register: AbstractIntlMessages } }>,
    readPriceList(),
  ])

  return (
    <div className="max-w-xl">
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-2 mb-8 text-[17px] text-[var(--fg-muted)]">{t('intro')}</p>
      {/* Only the slice the form renders goes to the browser; `site` is not a
          client namespace. */}
      <NextIntlClientProvider messages={{ site: { register: messages.site.register } }}>
        <RegisterForm prices={priceList.prices} sellable={priceList.sellable} />
      </NextIntlClientProvider>
      <p className="mt-6 text-[15px] text-[var(--fg-muted)]">
        {t.rich('haveAccount', {
          login: (chunks) => (
            <a href="/login" className="underline underline-offset-2">
              {chunks}
            </a>
          ),
        })}
      </p>
    </div>
  )
}
