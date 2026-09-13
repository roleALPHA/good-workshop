import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { peekMagicLink } from '@/server/auth/magic-link'
import { ConfirmForm } from './confirm-form'

export const dynamic = 'force-dynamic'

// The token is in the URL. Nothing here belongs in an index.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

/**
 * Where a magic link lands.
 *
 * A GET that changes NOTHING. This used to be a route handler that consumed the
 * token on GET, on the theory that a prefetching mail client burning a
 * single-use link is harmless. It is not: Microsoft Defender's Safe Links
 * fetches every URL in a Microsoft 365 mailbox before delivery, so on exactly
 * those installs the person arrived to "expired" every time, and requesting a
 * new link only repeated it.
 *
 * So the page only looks, and the button spends. A scanner fetches; it does not
 * submit forms. Same URL as before, so links already sitting in inboxes still
 * work.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  if (!token) redirect('/login?error=missing')

  // Checked up front so a spent link says so at once, instead of offering a
  // button that is certain to fail.
  if (!(await peekMagicLink(token))) redirect('/login?error=invalid')

  const t = await getTranslations('auth.verify')

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mt-1 text-[15px] text-[var(--fg-muted)]">{t('intro')}</p>
      <ConfirmForm token={token} />
    </div>
  )
}
