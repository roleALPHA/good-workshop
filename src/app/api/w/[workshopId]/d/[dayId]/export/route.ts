import { NextResponse, type NextRequest } from 'next/server'
import { withTenant } from '@/server/db'
import { readSession } from '@/server/auth/session'
import { assertWorkshopAccess, ForbiddenError, NotFoundError } from '@/domain/agenda/access'
import { loadDay } from '@/domain/agenda/repo'
import { renderDayMarkdown } from '@/server/export/markdown'
import { workshop as workshopTable } from '@/server/db/schema'
import { eq } from 'drizzle-orm'
import { getLocale } from 'next-intl/server'
import { asLocale } from '@/i18n/resolve'

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

  /**
   * `?locale=fr` beats the exporter's own language.
   *
   * The common case is a facilitator exporting for themselves, so their
   * language is the default. The case that made this a parameter is the other
   * one: a German facilitator handing a French agenda to French participants.
   * Without it the only way through is to change your account language, export,
   * and change it back -- and people do the first half of that.
   */
  const locale = asLocale(params.get('locale')) ?? (await getLocale())
  const flavor = params.get('flavor') === 'outline' ? 'outline' : 'agenda'
  const notes = params.get('notes') === '1'

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
        const { doc } = await loadDay(tx, access, dayId, locale)

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
              locale,
              flavor,
              includePrivateFields: notes,
            },
          ),
        }
      },
    )

    return new NextResponse(markdown, {
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'content-disposition': `attachment; filename="${slug(title)}.md"`,
        /**
         * Everything that changes the bytes, not just the content version.
         *
         * It was `"${contentVersion}"` alone, which is wrong in a way nobody
         * would reproduce on purpose: ask for the German export, then ask for
         * the French one, and the conditional request matches on the version
         * and answers 304 with the German file still in the client's cache.
         * The same was already true of ?flavor and ?notes before any of this.
         */
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

/**
 * A filename that survives every language.
 *
 * The German digraphs run FIRST and the order is load-bearing: strip the
 * diacritics first and `ü` collapses to `u`, which would silently change the
 * filename of every German export on upgrade.
 *
 * Then NFD plus removing the combining marks, which handles é, ñ, ç, à and the
 * rest. Before that, "Réunion stratégie" came out as `r-union-strat-gie`.
 *
 * Deliberately not locale-dependent: the transliteration is a property of the
 * TITLE's language, and the title is free tenant text that nobody has declared
 * a language for. Unconditional ä→ae never corrupts a French title -- ä and ö
 * appear in French only in loanwords -- and it keeps one code path.
 */
function slug(title: string): string {
  return (
    title
      .toLowerCase()
      .replaceAll('ä', 'ae')
      .replaceAll('ö', 'oe')
      .replaceAll('ü', 'ue')
      .replaceAll('ß', 'ss')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60) || 'workshop'
  )
}
