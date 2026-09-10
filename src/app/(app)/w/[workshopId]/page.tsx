import { notFound, redirect } from 'next/navigation'
import { firstDayOf } from '@/domain/workshop/repo'
import { assertWorkshopAccess } from '@/domain/agenda/access'
import { withTenant } from '@/server/db'
import { currentActor } from '@/server/actions/context'

export const dynamic = 'force-dynamic'

/**
 * A workshop always opens on a day -- there is nothing else to look at.
 * The redirect keeps `/w/<id>` a stable link people can share.
 */
export default async function WorkshopPage({
  params,
}: {
  params: Promise<{ workshopId: string }>
}) {
  const { workshopId } = await params
  const actor = await currentActor()
  if (!actor) redirect('/login')

  const dayId = await withTenant(actor, async (tx) => {
    await assertWorkshopAccess(tx, actor, workshopId, 'workshop.read')
    return firstDayOf(tx, workshopId)
  }).catch(() => null)

  if (!dayId) notFound()
  redirect(`/w/${workshopId}/d/${dayId}`)
}
