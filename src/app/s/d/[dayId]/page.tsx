import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { getLocale, getTranslations } from 'next-intl/server'
import { AgendaSurface } from '@/components/agenda/agenda-surface'
import { assertWorkshopAccess } from '@/domain/agenda/access'
import { loadDay } from '@/domain/agenda/repo'
import { presenceHue } from '@/domain/collab/presence'
import { listDays } from '@/domain/workshop/repo'
import { guestActor, readGuestSessionCached } from '@/server/auth/share-session'
import { withTenant } from '@/server/db'
import { workshop as workshopTable } from '@/server/db/schema'
import { LeaveGuestAccess } from './leave'

export const dynamic = 'force-dynamic'

/**
 * One day of one shared agenda, for somebody with no account.
 *
 * THE WORKSHOP IS NOT IN THE URL. That is the whole containment: the route names
 * a day, the workshop comes from the guest's own session, and
 * `assertWorkshopAccess` is asked about THAT workshop. A guest who edits the
 * address bar can reach a day of the workshop they were invited to and nothing
 * else -- not because a check rejects them, but because there is no parameter in
 * which to express anywhere else.
 *
 * The day still has to be checked: `listDays` for the session's workshop is the
 * set of days that exist for this guest, and a `dayId` from another workshop is
 * simply not in it. `loadDay` would refuse it anyway (it takes the branded
 * WorkshopAccess), and this way the answer is 404 rather than an error page.
 *
 * Everything the member page has and this one does not is deliberate: no link to
 * the library, no tag editor, no access screen, no Markdown export, no print
 * view. A guest with read permission holds `workshop.read` alone, so the export
 * routes would refuse them -- and offering a button that 404s is worse than not
 * offering it.
 */
export default async function GuestDayPage({ params }: { params: Promise<{ dayId: string }> }) {
  const { dayId } = await params
  const guest = await readGuestSessionCached()
  // No redirect to a login: a guest has no account to sign in to, and the token
  // is the only way back in. 404 is also what an expired or withdrawn invitation
  // produces, which is the same thing from the guest's side.
  if (!guest) notFound()

  const actor = guestActor(guest)
  const [t, locale] = await Promise.all([getTranslations('workshop'), getLocale()])

  const data = await withTenant(actor, async (tx) => {
    const access = await assertWorkshopAccess(tx, actor, guest.workshopId, 'workshop.read')
    const days = await listDays(tx, guest.workshopId)
    if (!days.some((day) => day.id === dayId)) return null

    const { doc } = await loadDay(tx, access, dayId, locale)
    const meta = await tx
      .select({ title: workshopTable.title })
      .from(workshopTable)
      .where(eq(workshopTable.id, guest.workshopId))
      .limit(1)

    return {
      doc,
      title: meta[0]?.title ?? t('untitled'),
      days,
      canEdit: access.can('workshop.content.write'),
      // From the share link rather than a member id, so a guest keeps one colour
      // across their devices -- the same reasoning as for a colleague.
      userHue: presenceHue(guest.linkId),
    }
  }).catch(() => null)

  if (!data) notFound()

  const g = await getTranslations('workshop.guest')

  return (
    <div>
      <header className="mb-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{data.title}</h1>
            <p className="mt-1 text-[13px] text-[var(--fg-muted)]">
              {data.canEdit ? g('bannerEditor') : g('banner')}
            </p>
          </div>
          <LeaveGuestAccess label={g('leave')} />
        </div>

        {data.days.length > 1 && (
          <nav aria-label={t('days')} className="mt-3 flex flex-wrap gap-1">
            {data.days.map((day) => (
              <Link
                key={day.id}
                href={`/s/d/${day.id}`}
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
        readOnly={!data.canEdit}
        collab={
          data.canEdit
            ? {
                workshopId: guest.workshopId,
                dayId,
                // The invited address is the name colleagues see. A guest cannot
                // choose it, which is the point -- somebody in the room needs to
                // know who the external participant is.
                user: { name: guest.email, hue: data.userHue },
                url: process.env.GW_COLLAB_URL,
              }
            : undefined
        }
      />
    </div>
  )
}
