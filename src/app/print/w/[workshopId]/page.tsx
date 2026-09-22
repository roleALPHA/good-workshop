import { notFound } from 'next/navigation'
import { assertWorkshopAccess, ForbiddenError, NotFoundError } from '@/domain/agenda/access'
import { loadWorkshopExport } from '@/server/export/workshop'
import { PrintDay } from './print-day'
import { ATTRIBUTION_TEXT } from '@/lib/attribution'
import { readSession } from '@/server/auth/session'
import { withTenant } from '@/server/db'
import { getLocale, getTranslations } from 'next-intl/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * The whole workshop on paper, and the way a PDF of it is made.
 *
 * Every day one after another, each starting on a fresh sheet -- a workshop
 * handed over as one document rather than as a stack somebody has to collate.
 * PDF is the browser's own print-to-PDF, for the reason the day view gives:
 * running headless Chrome in a self-hostable image buys very little here.
 *
 * It asks for `workshop.export` and nothing else, so it keeps working in a
 * workspace that is read-only or blocked for non-payment. The contents are the
 * customer's; being unable to pay is not a reason to be locked out of them.
 */
export default async function PrintWorkshopPage({
  params,
  searchParams,
}: {
  params: Promise<{ workshopId: string }>
  searchParams: Promise<{ notes?: string }>
}) {
  const session = await readSession()
  if (!session) notFound()

  const { workshopId } = await params
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
      return loadWorkshopExport(tx, access, locale)
    })
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ForbiddenError) notFound()
    throw error
  }

  return (
    <main>
      {data.days.length === 0 && (
        <header data-print-section className="mb-6 border-b border-neutral-300 pb-3">
          <h1 className="text-2xl font-semibold">{data.meta.title}</h1>
        </header>
      )}

      {data.days.map((doc, index) => (
        <PrintDay
          key={doc.id}
          doc={doc}
          // The workshop's title on the first sheet, the day's own on the ones
          // after: whoever picks up page four should not have to leaf back to
          // see which workshop they are holding, but nor should page one read
          // "Tag 2" where the title belongs.
          heading={index === 0 ? data.meta.title : doc.title || doc.date || t('untitled')}
          locale={locale}
          showNotes={showNotes}
          breakBefore={index > 0}
        />
      ))}

      <p className="mt-6 text-center text-xs text-neutral-500">{ATTRIBUTION_TEXT}</p>
    </main>
  )
}
