import { NextResponse, type NextRequest } from 'next/server'
import { withTenant } from '@/server/db'
import { readSession } from '@/server/auth/session'
import { assertWorkshopAccess, ForbiddenError, NotFoundError } from '@/domain/agenda/access'
import { renderWorkshopExport } from '@/server/export/workshop'
import { exportFilename } from '@/server/export/filename'
import { getLocale } from 'next-intl/server'
import { asLocale } from '@/i18n/resolve'

/**
 * A whole workshop, every day in one Markdown file.
 *
 * Its own route rather than a parameter on the day export, and deliberately a
 * short one: this is the path that stays open when a workspace is read-only or
 * blocked for non-payment, and it must not run through the editor or the
 * library to get there. It asks for `workshop.export` and nothing else.
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ workshopId: string }> },
) {
  const session = await readSession()
  if (!session) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 })

  const { workshopId } = await context.params
  const params = request.nextUrl.searchParams
  const locale = asLocale(params.get('locale')) ?? (await getLocale())
  const flavor = params.get('flavor') === 'outline' ? 'outline' : 'agenda'
  const notes = params.get('notes') === '1'

  const actor = {
    tenantId: session.tenantId,
    memberId: session.memberId,
    tenantRole: session.tenantRole,
    source: 'web' as const,
  }

  try {
    const { markdown, title, contentVersion } = await withTenant(actor, async (tx) => {
      const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.export')
      const rendered = await renderWorkshopExport(tx, access, locale, {
        flavor,
        includePrivateFields: notes,
      })
      return { ...rendered, contentVersion: access.contentVersion }
    })

    return new NextResponse(markdown, {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="${exportFilename(title)}.md"`,
        // Everything that changes the bytes, as on the day export: the version
        // alone would answer 304 with the German file for a French request.
        etag: `"${contentVersion}-${locale}-${flavor}-${notes ? 'n' : ''}"`,
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
