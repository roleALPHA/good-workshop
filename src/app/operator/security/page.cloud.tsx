import Link from 'next/link'
import type { Route } from 'next'
import { redirect } from 'next/navigation'
import { getFormatter, getTranslations } from 'next-intl/server'
import { operatorDb } from '@/cloud/operator/db'
import { listPasskeys } from '@/cloud/operator/auth'
import { currentOperator } from '@/cloud/operator/session'
import { Passkeys } from '../passkeys'

export const dynamic = 'force-dynamic'

/**
 * Where an operator manages their own passkeys.
 *
 * The first passkey used to be the only one, enrolled through a link that
 * `scripts/operator.mjs` prints on the server -- so an operator who signed in
 * by mail had no way to get back to a passkey without somebody with a shell.
 * From here they add one themselves.
 */
export default async function OperatorSecurity() {
  const operator = await currentOperator()
  if (!operator) redirect('/operator/login' as never)

  const [t, format, passkeys] = await Promise.all([
    getTranslations('operator.passkeys'),
    getFormatter(),
    listPasskeys(operatorDb(), operator.id),
  ])
  const when = (value: Date | null) =>
    value ? format.dateTime(value, { dateStyle: 'medium', timeStyle: 'short' }) : t('never')

  return (
    <div className="max-w-xl">
      <Link
        href={'/operator' as Route}
        className="text-[14px] text-[var(--fg-muted)] underline underline-offset-2"
      >
        {t('back')}
      </Link>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-1 text-[15px] text-[var(--fg-muted)]">
        {t('intro', { email: operator.email })}
      </p>
      <Passkeys
        passkeys={passkeys.map((passkey) => ({
          credentialId: passkey.credentialId,
          created: when(passkey.createdAt),
          lastUsed: when(passkey.lastUsedAt),
        }))}
      />
    </div>
  )
}
