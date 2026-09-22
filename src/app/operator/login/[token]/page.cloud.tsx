import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { operatorDb } from '@/cloud/operator/db'
import { peekSignInLink } from '@/cloud/operator/auth'
import { ConfirmSignIn } from '../../confirm-sign-in'

export const dynamic = 'force-dynamic'

/**
 * Where the sign-in link from the mail lands.
 *
 * A GET that changes NOTHING. This was a route handler that spent the token on
 * GET, on the theory that a mail client fetching a single-use link is
 * harmless. It is not: Microsoft Defender's Safe Links opens every URL in a
 * Microsoft 365 mailbox before delivery, and the console's operators are in
 * such a mailbox -- so the scanner went first and the link was always already
 * used.
 *
 * So the page only looks, and the button spends. Same URL as before, so links
 * already sitting in an inbox still work.
 */
export default async function OperatorSignInLink({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Checked up front so a spent link says so at once, instead of offering a
  // button that is certain to fail.
  const operator = await peekSignInLink(operatorDb(), token)
  if (!operator) redirect('/operator/login?link=invalid' as never)

  const t = await getTranslations('operator.signIn')
  return (
    <div className="mx-auto mt-16 max-w-sm">
      <h1 className="text-xl font-semibold tracking-tight">{t('linkTitle')}</h1>
      <p className="mt-1 text-[15px] text-[var(--fg-muted)]">
        {t('linkIntro', { email: operator.email })}
      </p>
      <ConfirmSignIn token={token} />
    </div>
  )
}
