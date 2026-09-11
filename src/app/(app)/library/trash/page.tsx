import Link from 'next/link'
import { loadTrash } from '@/server/actions/workshop'
import { TrashList } from './trash-list'

export const dynamic = 'force-dynamic'

/**
 * What was thrown away, and is still there.
 *
 * Its own page rather than a filter on the library: the library is where people
 * work, and a bin that shares that space invites deleting from it by accident.
 */
export default async function TrashPage() {
  const result = await loadTrash()

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold tracking-tight">Papierkorb</h1>
        <Link href="/library" className="text-[15px] text-[var(--fg-muted)] hover:underline">
          Zurück zur Bibliothek
        </Link>
      </div>

      {result.ok ? (
        <TrashList initial={result.data} />
      ) : (
        <p role="alert" className="text-[15px] text-[var(--fg-muted)]">
          {result.message}
        </p>
      )}
    </div>
  )
}
