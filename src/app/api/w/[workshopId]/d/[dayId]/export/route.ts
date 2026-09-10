import { NextResponse, type NextRequest } from 'next/server'
import { withTenant } from '@/server/db'
import { readSession } from '@/server/auth/session'
import { assertWorkshopAccess, ForbiddenError, NotFoundError } from '@/domain/agenda/access'
import { loadDay } from '@/domain/agenda/repo'
import { renderDayMarkdown } from '@/server/export/markdown'
import { workshop as workshopTable } from '@/server/db/schema'
import { eq } from 'drizzle-orm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workshopId: string; dayId: string }> },
) {
  const session = await readSession()
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const { workshopId, dayId } = await context.params
  const params = request.nextUrl.searchParams

  try {
    const { markdown, title, contentVersion } = await withTenant(
      {
        tenantId: session.tenantId,
        memberId: session.memberId,
        tenantRole: session.tenantRole,
        source: 'web',
      },
      async (tx) => {
        const actor = {
          tenantId: session.tenantId,
          memberId: session.memberId,
          tenantRole: session.tenantRole,
          source: 'web' as const,
        }
        const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.export')
        const { doc } = await loadDay(tx, access, dayId)

        const meta = await tx
          .select({ title: workshopTable.title, status: workshopTable.status })
          .from(workshopTable)
          .where(eq(workshopTable.id, workshopId))
          .limit(1)

        return {
          title: meta[0]?.title ?? 'Workshop',
          contentVersion: access.contentVersion,
          markdown: renderDayMarkdown(
            { title: meta[0]?.title ?? 'Workshop', status: meta[0]?.status },
            doc,
            {
              flavor: params.get('flavor') === 'outline' ? 'outline' : 'agenda',
              includeFacilitatorNotes: params.get('notes') === '1',
            },
          ),
        }
      },
    )

    return new NextResponse(markdown, {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="${slug(title)}.md"`,
        // Derived from content_version, so a client that has the current
        // version gets a 304 instead of the whole document.
        etag: `"${contentVersion}"`,
        'cache-control': 'private, no-cache',
      },
    })
  } catch (error) {
    if (error instanceof NotFoundError)
      return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (error instanceof ForbiddenError)
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    throw error
  }
}

function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replaceAll('ä', 'ae')
      .replaceAll('ö', 'oe')
      .replaceAll('ü', 'ue')
      .replaceAll('ß', 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'workshop'
  )
}
