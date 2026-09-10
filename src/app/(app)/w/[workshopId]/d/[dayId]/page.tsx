import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { Download, Printer } from 'lucide-react'
import { AgendaSummary } from '@/components/agenda/agenda-summary'
import { AgendaSurface } from '@/components/agenda/agenda-surface'
import { CategoryLegend } from '@/components/agenda/category-legend'
import { assertWorkshopAccess } from '@/domain/agenda/access'
import { loadDay } from '@/domain/agenda/repo'
import { listDays } from '@/domain/workshop/repo'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { flattenDay, toScheduleItems } from '@/features/agenda/flatten'
import { currentActor } from '@/server/actions/context'
import { withTenant } from '@/server/db'
import { workshop as workshopTable } from '@/server/db/schema'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * The agenda editor, on real data.
 *
 * Server-rendered from the day document and handed to a client island. There is
 * no loading state on first paint -- the agenda is there, then it becomes
 * interactive.
 */
export default async function DayPage({
  params,
}: {
  params: Promise<{ workshopId: string; dayId: string }>
}) {
  const { workshopId, dayId } = await params
  const actor = await currentActor()
  if (!actor) redirect('/login')

  const data = await withTenant(actor, async (tx) => {
    const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.read')
    const { doc, contentVersion } = await loadDay(tx, access, dayId)
    const meta = await tx
      .select({ title: workshopTable.title })
      .from(workshopTable)
      .where(eq(workshopTable.id, workshopId))
      .limit(1)
    return {
      doc,
      contentVersion: contentVersion.toString(),
      title: meta[0]?.title ?? 'Workshop',
      days: await listDays(tx, workshopId),
      canEdit: access.can('workshop.content.write'),
    }
  }).catch(() => null)

  if (!data) notFound()

  const rows = flattenDay(data.doc)
  const schedule = computeSchedule(data.doc.startMinute, toScheduleItems(rows))

  return (
    <div>
      <header className="mb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <Link href="/library" className="text-[13px] text-[var(--fg-muted)] hover:underline">
              ← Bibliothek
            </Link>
            <h1 className="mt-0.5 text-2xl font-semibold tracking-tight">{data.title}</h1>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/api/w/${workshopId}/d/${dayId}/export`}
              className="inline-flex items-center gap-1.5 rounded border border-[var(--border-strong)] px-2.5 py-1.5 text-[14px] hover:bg-[var(--surface-raised)]"
            >
              <Download aria-hidden className="size-4" />
              Markdown
            </Link>
            <Link
              href={`/print/w/${workshopId}/d/${dayId}`}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded border border-[var(--border-strong)] px-2.5 py-1.5 text-[14px] hover:bg-[var(--surface-raised)]"
            >
              <Printer aria-hidden className="size-4" />
              Drucken
            </Link>
          </div>
        </div>

        {data.days.length > 1 && (
          <nav aria-label="Tage" className="mt-3 flex flex-wrap gap-1">
            {data.days.map((day) => (
              <Link
                key={day.id}
                href={`/w/${workshopId}/d/${day.id}`}
                aria-current={day.id === dayId ? 'page' : undefined}
                className={`rounded px-2.5 py-1 text-[14px] ${
                  day.id === dayId
                    ? 'bg-[var(--brand-subtle-bg)] font-medium text-[var(--brand-subtle-fg)]'
                    : 'text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]'
                }`}
              >
                {day.title || 'Tag'}
              </Link>
            ))}
          </nav>
        )}

        <div className="mt-3">
          <AgendaSummary doc={data.doc} schedule={schedule} />
        </div>
        <div className="mt-3">
          <CategoryLegend doc={data.doc} />
        </div>
      </header>

      <AgendaSurface
        doc={data.doc}
        persistence={
          data.canEdit ? { workshopId, dayId, contentVersion: data.contentVersion } : undefined
        }
      />
    </div>
  )
}
