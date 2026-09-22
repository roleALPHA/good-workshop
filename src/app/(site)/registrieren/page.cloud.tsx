import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations } from 'next-intl/server'
import type { AbstractIntlMessages } from 'next-intl'
import { readPriceList } from '@/cloud/billing/price-list'
import { readSessionCached } from '@/server/auth/session'
import { RegisterForm } from './register-form'

export const dynamic = 'force-dynamic'

/**
 * The one page of the website that asks not to be indexed.
 *
 * It is a form, and unlike every other public page it has a single address
 * for all four languages -- the language comes from the visitor, not from the
 * URL, because a registration is a flow and not something anybody searches
 * for. That combination is precisely what a canonical cannot describe: one
 * URL with four different bodies. `follow` stays on, so the links out of it
 * still count.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('site.register')
  return { title: t('title'), robots: { index: false, follow: true } }
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
