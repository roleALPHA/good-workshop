import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { Download, Printer, Users } from 'lucide-react'
import { AgendaSurface } from '@/components/agenda/agenda-surface'
import { TagEditor } from '@/components/agenda/tag-editor'
import { ReadOnlyBadge } from '@/components/read-only-badge'
import { assertWorkshopAccess } from '@/domain/agenda/access'
import { presenceHue } from '@/domain/collab/presence'
import { loadDay } from '@/domain/agenda/repo'
import { tagsOf } from '@/domain/workshop/tags'
import { listDays } from '@/domain/workshop/repo'
import { currentActor } from '@/server/actions/context'
import { readSession } from '@/server/auth/session'
import { memberIdOf, withTenant } from '@/server/db'
import { workshop as workshopTable } from '@/server/db/schema'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'

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

  // The name other people see. A member id would be honest and useless -- the
  // point of presence is recognising a colleague.
  const session = await readSession()
  const [t, locale] = await Promise.all([getTranslations('workshop'), getLocale()])
  const displayName = session?.displayName?.trim() || (session?.email ?? t('someone'))

  const data = await withTenant(actor, async (tx) => {
    const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.read')
    const { doc, contentVersion } = await loadDay(tx, access, dayId, locale)
    const meta = await tx
      .select({ title: workshopTable.title })
      .from(workshopTable)
      .where(eq(workshopTable.id, workshopId))
      .limit(1)
    return {
      doc,
      contentVersion: contentVersion.toString(),
      title: meta[0]?.title ?? t('untitled'),
      days: await listDays(tx, workshopId),
      tags: await tagsOf(tx, workshopId),
      canUpdate: access.can('workshop.update'),
      canEdit: access.can('workshop.content.write'),
      canShare: access.can('workshop.share'),
      // Derived from the member id, so the same person keeps the same colour
      // across sessions and devices without storing a preference nobody set.
      userHue: presenceHue(memberIdOf(actor)),
    }
  }).catch(() => null)

  if (!data) notFound()

  return (
    <div>
      <header className="mb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <Link href="/library" className="text-[13px] text-[var(--fg-muted)] hover:underline">
              {t('backToLibrary')}
            </Link>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{data.title}</h1>
              {/* Where the editor would have been, saying why it is not. */}
              {!data.canEdit && <ReadOnlyBadge />}
            </div>
            {data.canUpdate ? (
              <div className="mt-1.5">
                <TagEditor workshopId={workshopId} initial={data.tags} />
              </div>
            ) : (
              data.tags.length > 0 && (
                <p className="mt-1.5 text-[13px] text-[var(--fg-muted)]">{data.tags.join(' · ')}</p>
              )
            )}
          </div>

          <div className="flex items-center gap-2">
            {data.canShare && (
              <Link
                href={`/w/${workshopId}/sharing`}
                className="inline-flex items-center gap-1.5 rounded border border-[var(--border-strong)] px-2.5 py-1.5 text-[14px] hover:bg-[var(--surface-raised)]"
              >
                <Users aria-hidden className="size-4" />
                {t('access')}
              </Link>
            )}
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
              {t('print')}
            </Link>
          </div>
        </div>

        {data.days.length > 1 && (
          <nav aria-label={t('days')} className="mt-3 flex flex-wrap gap-1">
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
                {day.title || t('untitledDay')}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <AgendaSurface
        doc={data.doc}
        canEdit={data.canEdit}
        collab={
          data.canEdit
            ? {
                workshopId,
                dayId,
                user: { name: displayName, hue: data.userHue },
                url: process.env.GW_COLLAB_URL,
              }
            : undefined
        }
      />
    </div>
  )
}
