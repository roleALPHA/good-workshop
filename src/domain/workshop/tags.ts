import { uuidv7 } from 'uuidv7'
import { eq, sql } from 'drizzle-orm'
import type { WorkshopAccess } from '@/domain/agenda/access'
import type { Tx } from '@/server/db'
import { tag, workshopTag } from '@/server/db/schema'

/**
 * Tags, created on the way in.
 *
 * Somebody typing "Onboarding" on a workshop means the tag, whether or not it
 * exists yet -- a separate "manage tags" screen you have to visit first is a
 * step nobody wants and a screen nobody maintains. The tenant-wide unique
 * index on the name is what keeps that from producing four spellings of the
 * same thing.
 */

export class TagError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TagError'
  }
}

const MAX_TAGS_PER_WORKSHOP = 12

export async function setWorkshopTags(
  tx: Tx,
  access: WorkshopAccess,
  names: string[],
): Promise<void> {
  const wanted = [...new Set(names.map((name) => name.trim()).filter(Boolean))]
  if (wanted.length > MAX_TAGS_PER_WORKSHOP) {
    throw new TagError(`Höchstens ${MAX_TAGS_PER_WORKSHOP} Tags pro Workshop.`)
  }
  if (wanted.some((name) => name.length > 40)) {
    throw new TagError('Ein Tag darf höchstens 40 Zeichen haben.')
  }

  const ids = await Promise.all(wanted.map((name) => tagIdFor(tx, name)))

  await tx.delete(workshopTag).where(eq(workshopTag.workshopId, access.workshopId))
  if (ids.length > 0) {
    await tx
      .insert(workshopTag)
      .values(ids.map((tagId) => ({ workshopId: access.workshopId, tagId })))
  }
}

/**
 * The tag with this name, made if it is new.
 *
 * The insert races with another request typing the same word, which the unique
 * index turns into a conflict rather than a duplicate -- and `onConflictDoNothing`
 * plus a read is how that race ends with both requests pointing at one row.
 */
async function tagIdFor(tx: Tx, name: string): Promise<string> {
  await tx.insert(tag).values({ id: uuidv7(), name }).onConflictDoNothing()

  const rows = await tx.select({ id: tag.id }).from(tag).where(eq(tag.name, name)).limit(1)
  if (!rows[0]) throw new TagError(`Der Tag "${name}" konnte nicht angelegt werden.`)
  return rows[0].id
}

export async function tagsOf(tx: Tx, workshopId: string): Promise<string[]> {
  const rows = await tx
    .select({ name: tag.name })
    .from(workshopTag)
    .innerJoin(tag, eq(tag.id, workshopTag.tagId))
    .where(eq(workshopTag.workshopId, workshopId))

  return rows.map((row) => row.name)
}

/**
 * Removes tags nothing points at any more.
 *
 * Without this the tag list only ever grows, and a filter row full of words
 * that match nothing is worse than no filter row. RLS scopes the delete to the
 * tenant, so it does not have to be said again here.
 */
export async function pruneUnusedTags(tx: Tx): Promise<void> {
  await tx.execute(sql`
    delete from tag t where not exists (
      select 1 from workshop_tag wt where wt.tag_id = t.id
    )
  `)
}
