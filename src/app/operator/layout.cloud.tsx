import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages } from 'next-intl/server'
import type { AbstractIntlMessages } from 'next-intl'
import type { Metadata } from 'next'
import { operatorConsoleEnabled } from '@/cloud/operator/db'
import { AppFooter } from '@/components/layout/app-footer'

export const dynamic = 'force-dynamic'
export const metadata: Metadata = { robots: { index: false, follow: false }, title: 'Operator' }

/**
 * The operator console exists in a process started with GW_OPERATOR_CONSOLE=1
 * and nowhere else: the public web container answers 404 here, and the proxy
 * sends the operator host to the console container only.
 */
export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  if (!operatorConsoleEnabled()) notFound()
  const messages = (await getMessages()) as {
    operator: AbstractIntlMessages
    common: AbstractIntlMessages
  }
  return (
    // `common` as well as `operator`: the console's own text is English and in
    // the source, but it reuses shared components -- CopyBlock says "copied"
    // out of this catalogue -- and a missing namespace renders as the bare key.
    <NextIntlClientProvider messages={{ operator: messages.operator, common: messages.common }}>
      <div className="flex min-h-dvh flex-col">
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <AppFooter />
      </div>
    </NextIntlClientProvider>
  )
}
