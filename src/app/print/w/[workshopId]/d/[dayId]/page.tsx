import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { assertWorkshopAccess, ForbiddenError, NotFoundError } from '@/domain/agenda/access'
import { loadDay } from '@/domain/agenda/repo'
import { PrintDay } from '../../print-day'
import { ATTRIBUTION_TEXT } from '@/lib/attribution'
import { readSession } from '@/server/auth/session'
import { withTenant } from '@/server/db'
import { workshop as workshopTable } from '@/server/db/schema'
import { getLocale, getTranslations } from 'next-intl/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The facilitator's paper copy.
 *
 * Server-rendered, no client JavaScript: whatever comes out of the printer has
 * to match what was on screen, and a hydration pass that reflows the page while
 * the print dialog is open would break exactly that.
 *
 * PDF is the browser's own print-to-PDF. Running headless Chrome in a
 * self-hostable image is a real operational burden for very little gain here.
 */
export default async function PrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ workshopId: string; dayId: string }>
  searchParams: Promise<{ notes?: string }>
}) {
  const session = await readSession()
  if (!session) notFound()

  const { workshopId, dayId } = await params
  const { notes } = await searchParams
  const showNotes = notes === '1'
  const [t, locale] = await Promise.all([getTranslations('workshop'), getLocale()])

  const actor = {
    tenantId: session.tenantId,
    memberId: session.memberId,
    tenantRole: session.tenantRole,
    source: 'web' as const,
  }

  let data
  try {
    data = await withTenant(actor, async (tx) => {
      const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.export')
      const { doc } = await loadDay(tx, access, dayId, locale)
      const meta = await tx
        .select({ title: workshopTable.title })
        .from(workshopTable)
        .where(eq(workshopTable.id, workshopId))
        .limit(1)
      return { doc, title: meta[0]?.title ?? t('untitled') }
    })
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound()
    throw error
  }

  return (
    <main>
      <PrintDay doc={data.doc} heading={data.title} locale={locale} showNotes={showNotes} />
      <p className="mt-6 text-center text-xs text-neutral-500">{ATTRIBUTION_TEXT}</p>
    </main>
  )
}
