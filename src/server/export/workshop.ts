import { eq, sql } from 'drizzle-orm'
import type { Tx } from '@/server/db'
import type { WorkshopAccess } from '@/domain/agenda/access'
import { loadDay } from '@/domain/agenda/repo'
import { listDays } from '@/domain/workshop/repo'
import { workshop as workshopTable } from '@/server/db/schema'
import { renderWorkshopMarkdown, type ExportOptions, type WorkshopMeta } from './markdown'
import type { DayDoc } from '@/domain/agenda/types'
import type { Locale } from '@/i18n/config'

/**
 * A whole workshop as one Markdown file.
 *
 * The one place that assembles an export of more than a single day, so that the
 * HTTP route, the print view and the MCP tool cannot drift apart in what they
 * include. It reads the relational tables like every other read: the CRDT is
 * the editing layer, Postgres is the record.
 *
 * Days are loaded one by one through `loadDay` rather than in one wide query.
 * That is deliberate -- `loadDay` is the single place that projects fractional
 * positions down to the ordinals every reader sees, and a second implementation
 * of that projection is a second implementation to get subtly wrong. A workshop
 * has days in the single digits.
 */
export async function renderWorkshopExport(
  tx: Tx,
  access: WorkshopAccess,
  locale: Locale,
  options: ExportOptions = {},
): Promise<{ title: string; markdown: string }> {
  const { meta, days } = await loadWorkshopExport(tx, access, locale)
  return { title: meta.title, markdown: renderWorkshopMarkdown(meta, days, { ...options, locale }) }
}

/**
 * The same workshop, before anything is rendered: the print view lays the days
 * out as HTML rather than as Markdown and needs the documents themselves.
 */
export async function loadWorkshopExport(
  tx: Tx,
  access: WorkshopAccess,
  locale: Locale,
): Promise<{ meta: Required<Pick<WorkshopMeta, 'title'>> & WorkshopMeta; days: DayDoc[] }> {
  const meta = await tx
    .select({
      title: workshopTable.title,
      status: workshopTable.status,
      folderId: workshopTable.folderId,
      updatedAt: workshopTable.updatedAt,
      tags: sql<string[]>`coalesce((
        select json_agg(t.name order by t.name)
        from workshop_tag wt join tag t on t.id = wt.tag_id
        where wt.workshop_id = ${workshopTable.id}
      ), '[]'::json)`,
    })
    .from(workshopTable)
    .where(eq(workshopTable.id, access.workshopId))
    .limit(1)

  const row = meta[0]
  const title = row?.title ?? 'Workshop'
  const folderPath = row?.folderId ? await folderNames(tx, row.folderId) : []

  const days = await listDays(tx, access.workshopId)
  const docs = []
  for (const day of days) {
    const { doc } = await loadDay(tx, access, day.id, locale)
    docs.push(doc)
  }

  return {
    meta: {
      title,
      status: row?.status,
      tags: row?.tags ?? [],
      folderPath,
      updatedAt: row?.updatedAt ?? undefined,
    },
    days: docs,
  }
}

/** The folders a workshop sits in, outermost first. */
async function folderNames(tx: Tx, folderId: string): Promise<string[]> {
  const rows = await tx.execute<{ name: string }>(sql`
    select f.name
      from folder pf
      cross join lateral unnest(array_append(pf.ancestor_ids, pf.id)) with ordinality as u(fid, ord)
      join folder f on f.id = u.fid
     where pf.id = ${folderId}
     order by u.ord
  `)
  return rows.rows.map((row) => row.name)
}
