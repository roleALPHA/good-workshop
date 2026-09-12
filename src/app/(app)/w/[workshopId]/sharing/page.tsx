import Link from 'next/link'
import { notFound } from 'next/navigation'
import { loadSharing } from '@/server/actions/sharing'
import { SharingList } from './sharing-list'
import { GuestInvites } from './guest-invites'
import { getTranslations } from 'next-intl/server'

export const dynamic = 'force-dynamic'

/**
 * Who may open this workshop, in two parts.
 *
 * COLLEAGUES are picked from the tenant, never by e-mail address: an address is
 * an identity and identities are global, so inviting a colleague by address here
 * would quietly hand somebody access across a tenant boundary. Getting into the
 * tenant is a separate, deliberate step under Mitglieder.
 *
 * GUESTS are invited by address -- and that does not contradict the paragraph
 * above, because a share link is not a membership. It creates no identity and no
 * member row, it lives in this tenant under RLS, and it opens exactly one
 * workshop. The address on it is not an identity; it is the second factor the
 * invited person types in. See src/domain/workshop/share-links.ts.
 */
export default async function SharingPage({ params }: { params: Promise<{ workshopId: string }> }) {
  const { workshopId } = await params
  const result = await loadSharing(workshopId)
  if (!result.ok) notFound()

  const t = await getTranslations('workshop')
  const { title, ownerId, canShare, people, guests, dated } = result.data

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5">
        <Link
          href={`/w/${workshopId}`}
          className="text-[13px] text-[var(--fg-muted)] hover:underline"
        >
          ← {title}
        </Link>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight">{t('access')}</h1>
        <p className="mt-1 text-[15px] text-[var(--fg-muted)]">{t('accessIntro')}</p>
      </header>

      <SharingList workshopId={workshopId} ownerId={ownerId} canShare={canShare} people={people} />

      {/* Only for somebody who may invite: a viewer has no business with the
          addresses of a workshop's external guests. */}
      {canShare && <GuestInvites workshopId={workshopId} guests={guests} dated={dated} />}
    </div>
  )
}
