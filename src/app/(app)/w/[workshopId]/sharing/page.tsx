import Link from 'next/link'
import { notFound } from 'next/navigation'
import { loadSharing } from '@/server/actions/sharing'
import { SharingList } from './sharing-list'

export const dynamic = 'force-dynamic'

/**
 * Who may open this workshop.
 *
 * People are picked from the tenant, never by e-mail address: an address is an
 * identity and identities are global, so inviting by address here would quietly
 * hand somebody access across a tenant boundary. Getting into the tenant is a
 * separate, deliberate step under Mitglieder.
 */
export default async function SharingPage({ params }: { params: Promise<{ workshopId: string }> }) {
  const { workshopId } = await params
  const result = await loadSharing(workshopId)
  if (!result.ok) notFound()

  const { title, ownerId, canShare, people } = result.data

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-5">
        <Link
          href={`/w/${workshopId}`}
          className="text-[13px] text-[var(--fg-muted)] hover:underline"
        >
          ← {title}
        </Link>
        <h1 className="mt-0.5 text-xl font-semibold tracking-tight">Zugriff</h1>
        <p className="mt-1 text-[15px] text-[var(--fg-muted)]">
          Bearbeiter:innen sehen Änderungen sofort — sie sind im selben Dokument. Lesende sehen den
          Ablauf, ändern aber nichts.
        </p>
      </header>

      <SharingList workshopId={workshopId} ownerId={ownerId} canShare={canShare} people={people} />
    </div>
  )
}
