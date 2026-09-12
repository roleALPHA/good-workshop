import { getTranslations } from 'next-intl/server'
import { readShareGate } from '@/server/auth/share-invite'
import { GateForm } from './gate-form'

export const dynamic = 'force-dynamic'

/**
 * Where an invitation lands.
 *
 * A GET that changes NOTHING, which is the one thing to preserve about this
 * route. The magic-link route at /verify is the opposite -- it consumes its token
 * on GET, deliberately, because a prefetching mail client burning a single-use
 * login link is harmless. Here the link is durable: the guest will come back to
 * it tomorrow from their phone. A link preview must not be able to spend it, and
 * nothing on this page is a side effect.
 *
 * What it shows is the workshop's TITLE and nothing else. Not the day, not the
 * agenda, and not the invited address -- somebody who received the invitation
 * already knows which address to type, and somebody who merely found the link
 * would otherwise be handed the answer.
 */
export default async function ShareGatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const [gate, t] = await Promise.all([readShareGate(token), getTranslations('auth.guest')])

  // One page for unknown, revoked and expired. Distinguishing them would confirm
  // to a stranger that a link exists, and tells the invited person nothing they
  // can act on: either way they need a new invitation.
  if (!gate) {
    return (
      <div className="mx-auto max-w-md py-8">
        <h1 className="text-xl font-semibold tracking-tight">{t('invalidTitle')}</h1>
        <p className="mt-2 text-[15px] text-[var(--fg-muted)]">{t('invalidBody')}</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-md py-8">
      <h1 className="text-xl font-semibold tracking-tight">
        {t('title', { workshop: gate.workshopTitle })}
      </h1>
      <p className="mt-2 text-[15px] text-[var(--fg-muted)]">{t('intro')}</p>
      <GateForm token={token} />
    </div>
  )
}
