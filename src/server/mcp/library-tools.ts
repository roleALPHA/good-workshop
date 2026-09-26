import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { assertWorkshopAccess, NotFoundError } from '@/domain/agenda/access'
import { assertTenantAdmin } from '@/domain/tenant/members'
import { createFolder, deleteFolder, listFolders, moveFolder } from '@/domain/workshop/folders'
import {
  LIBRARY_PAGE_SIZE,
  listTags,
  listTrashedWorkshops,
  listWorkshops,
} from '@/domain/workshop/library'
import {
  createWorkshop,
  moveWorkshopToFolder,
  purgeWorkshop,
  renameWorkshop,
  restoreWorkshop,
  trashWorkshop,
} from '@/domain/workshop/repo'
import { pruneUnusedTags, setWorkshopTags } from '@/domain/workshop/tags'
import { renderWorkshopExport } from '@/server/export/workshop'
import { withTenant, type Tx } from '@/server/db'
import { auditEvent } from '@/server/db/schema'
import { DEFAULT_LOCALE, LOCALES } from '@/i18n/config'
import { requireScope, type PatActor } from './auth'
import { guarded, ok } from './respond'

/**
 * The library over MCP: folders, workshops, tags and the bin.
 *
 * The rule for what belongs here is the library screen and the workshop page.
 * Whatever a person can do there, a model can do here -- under the same checks,
 * because every body calls the same repository function behind the same
 * capability the server action uses. Moving and deleting folders is for tenant
 * admins in the library, so it is for tenant admins here.
 *
 * What is NOT here, on purpose: sharing a workshop or a folder, guest links,
 * members. A token acts as its person, and handing out access on that person's
 * behalf is a step a model must not be able to take. See docs/architecture.md.
 *
 * None of these touch a day's CONTENT, so none of them goes through the
 * collaboration room and none takes an `expectedVersion` -- which is why this
 * surface needs no Authorization header of its own, only the actor. The days of a
 * workshop are next door in ./day-tools.ts; they used to stand here, and they are
 * what made this file look like it needed both.
 */

type Ctx = { actor: PatActor; authorization: string }

const Id = z.string().uuid()
const Title = z.string().trim().min(1).max(300)
const FolderName = z.string().trim().min(1).max(120)
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
export function registerLibraryTools(server: McpServer, { actor }: Ctx): void {
  /** Written in the same transaction as the change it describes. */
  const audit = (
    tx: Tx,
    entityType: 'workshop' | 'folder',
    action: string,
    entityId: string | null,
    data: Record<string, unknown> = {},
  ) =>
    tx.insert(auditEvent).values({
      actorMemberId: actor.memberId,
      source: 'mcp',
      tokenId: actor.patId,
      entityType,
      entityId,
      action,
      data,
    })

  // ── Folders ─────────────────────────────────────────────────────────────

  server.registerTool(
    'list_folders',
    {
      title: 'List folders',
      description:
        'The folder tree, in display order: every folder directly below its parent, siblings alphabetical. ' +
        '`depth` 0 is the top level; `parentId` names the folder above.',
      inputSchema: {},
    },
    async () =>
      guarded(async () => {
        requireScope(actor, 'workshops:read')
        const folders = await withTenant(actor, (tx) => listFolders(tx))
        if (folders.length === 0) return ok('No folders yet.', { folders: [] })

        return ok(folders.map((f) => `${'  '.repeat(f.depth)}${f.name} — id=${f.id}`).join('\n'), {
          folders: folders.map((f) => ({
            id: f.id,
            name: f.name,
            parentId: f.parentId,
            depth: f.depth,
          })),
        })
      }),
  )

  server.registerTool(
    'create_folder',
    {
      title: 'Create a folder',
      description:
        'Creates a folder at the top level, or inside `parentId`. Names are unique among siblings, ignoring case.',
      inputSchema: { name: FolderName, parentId: Id.nullable().optional() },
    },
    async ({ name, parentId }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        return withTenant(actor, async (tx) => {
          const id = await createFolder(tx, actor, name, parentId ?? null)
          await audit(tx, 'folder', 'folder.create', id, { name, parentId: parentId ?? null })
          return ok(`Folder created: ${name}\nfolderId=${id}`, { id })
        })
      }),
  )

  server.registerTool(
    'move_folder',
    {
      title: 'Move a folder',
      description:
        'Moves a folder with everything in it under `parentId`, or to the top level with null. ' +
        'Folders are always listed alphabetically, so there is no position to choose; `afterId` is ' +
        'still accepted from older clients and changes nothing visible. Tenant admins only.',
      inputSchema: {
        folderId: Id,
        parentId: Id.nullable(),
        afterId: Id.nullable().optional(),
      },
    },
    async ({ folderId, parentId, afterId }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        return withTenant(actor, async (tx) => {
          assertTenantAdmin(actor)
          await moveFolder(tx, folderId, parentId, afterId ?? null)
          await audit(tx, 'folder', 'folder.move', folderId, { parentId, afterId: afterId ?? null })
          return ok('Folder moved.')
        })
      }),
  )

  server.registerTool(
    'delete_folder',
    {
      title: 'Delete a folder',
      description:
        'Deletes a folder. Nothing inside it is deleted: its subfolders and workshops move up one level. ' +
        'Tenant admins only.',
      inputSchema: { folderId: Id },
    },
    async ({ folderId }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        return withTenant(actor, async (tx) => {
          assertTenantAdmin(actor)
          await deleteFolder(tx, folderId)
          await audit(tx, 'folder', 'folder.delete', folderId)
          return ok('Folder deleted. Its contents moved up one level.')
        })
      }),
  )

  // ── Workshops ───────────────────────────────────────────────────────────

  server.registerTool(
    'list_tags',
    {
      title: 'List tags',
      description: 'Every tag in use, with how many workshops carry it.',
      inputSchema: {},
    },
    async () =>
      guarded(async () => {
        requireScope(actor, 'workshops:read')
        const tags = await withTenant(actor, (tx) => listTags(tx))
        if (tags.length === 0) return ok('No tags yet.', { tags: [] })
        return ok(tags.map((t) => `${t.name} (${t.count}) — id=${t.id}`).join('\n'), { tags })
      }),
  )

  server.registerTool(
    'list_workshops',
    {
      title: 'List workshops',
      description:
        'The workshops this token may open, most recently changed first. Filter by folder, tag or ' +
        'title; pass `nextCursor` back as `cursor` for the next page.',
      inputSchema: {
        folderId: Id.nullable()
          .optional()
          .describe('Only workshops directly in this folder; null for those in no folder.'),
        tagId: Id.optional(),
        search: z.string().trim().max(200).optional().describe('Part of the title.'),
        cursor: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(100).default(LIBRARY_PAGE_SIZE),
      },
    },
    async ({ folderId, tagId, search, cursor, limit }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:read')
        // The library's own query, and that is the fix rather than a tidy-up:
        // this tool used to select every workshop in the tenant, so a member
        // saw the titles of workshops nobody had shared with them.
        const page = await withTenant(actor, (tx) =>
          listWorkshops(tx, actor, { folderId, tagId, search, cursor, limit }),
        )

        const workshops = page.workshops.map((w) => ({
          id: w.id,
          title: w.title,
          status: w.status,
          folderId: w.folderId,
          dayCount: w.dayCount,
          tags: w.tags.map((t) => t.name),
          role: w.role,
          updatedAt: w.updatedAt.toISOString(),
        }))

        const lines = workshops.map(
          (w) =>
            `${w.id}  ${w.title} (${w.status}, ${w.dayCount} ${w.dayCount === 1 ? 'day' : 'days'}` +
            `${w.folderId ? `, folder=${w.folderId}` : ''}` +
            `${w.tags.length > 0 ? `, tags: ${w.tags.join(', ')}` : ''})`,
        )
        if (page.nextCursor) lines.push(`nextCursor: ${page.nextCursor}`)

        return ok(lines.length > 0 ? lines.join('\n') : 'No workshops match.', {
          workshops,
          nextCursor: page.nextCursor,
        })
      }),
  )

  server.registerTool(
    'create_workshop',
    {
      title: 'Create a workshop',
      description:
        'Creates a workshop with its first day and returns both ids. `folderId` files it in a folder.',
      inputSchema: {
        title: Title,
        folderId: Id.nullable().optional(),
        date: IsoDate.optional().describe('The date of the first day.'),
      },
    },
    async ({ title, folderId, date }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        return withTenant(actor, async (tx) => {
          const created = await createWorkshop(tx, actor, {
            title,
            folderId: folderId ?? null,
            date: date ?? null,
          })
          await audit(tx, 'workshop', 'workshop.create', created.workshopId, {
            title,
            folderId: folderId ?? null,
          })
          return ok(
            `Created: ${title}\nworkshopId=${created.workshopId}\ndayId=${created.dayId}`,
            created,
          )
        })
      }),
  )

  server.registerTool(
    'rename_workshop',
    {
      title: 'Rename a workshop',
      description: 'Changes the title of a workshop.',
      inputSchema: { workshopId: Id, title: Title },
    },
    async ({ workshopId, title }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        return withTenant(actor, async (tx) => {
          const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.update')
          await renameWorkshop(tx, access, title)
          await audit(tx, 'workshop', 'workshop.rename', workshopId, { title })
          return ok(`Renamed to ${title}.`)
        })
      }),
  )

  server.registerTool(
    'move_workshop',
    {
      title: 'File a workshop',
      description: 'Moves a workshop into a folder, or out of every folder with null.',
      inputSchema: { workshopId: Id, folderId: Id.nullable() },
    },
    async ({ workshopId, folderId }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        return withTenant(actor, async (tx) => {
          const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.update')
          await moveWorkshopToFolder(tx, access, folderId)
          await audit(tx, 'workshop', 'workshop.move', workshopId, { folderId })
          return ok(folderId ? 'Filed in the folder.' : 'Taken out of its folder.')
        })
      }),
  )

  server.registerTool(
    'set_workshop_tags',
    {
      title: 'Set the tags of a workshop',
      description:
        'Replaces the tags of a workshop with this complete list. Tags that do not exist yet are created; ' +
        'an empty list removes all.',
      inputSchema: { workshopId: Id, tags: z.array(z.string()).max(24) },
    },
    async ({ workshopId, tags }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        return withTenant(actor, async (tx) => {
          const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.update')
          await setWorkshopTags(tx, access, tags)
          // Same as the tag editor: a tag nobody carries any more would pile up
          // in the library's filter row.
          await pruneUnusedTags(tx)
          await audit(tx, 'workshop', 'workshop.tags', workshopId, { tags })
          return ok(tags.length > 0 ? `Tags: ${tags.join(', ')}` : 'All tags removed.')
        })
      }),
  )

  // ── The bin ─────────────────────────────────────────────────────────────

  server.registerTool(
    'trash_workshop',
    {
      title: 'Move a workshop to the bin',
      description:
        'Moves a workshop to the bin. Nothing is lost: restore_workshop puts it back as it was.',
      inputSchema: { workshopId: Id },
    },
    async ({ workshopId }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        return withTenant(actor, async (tx) => {
          const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.delete')
          await trashWorkshop(tx, access)
          await audit(tx, 'workshop', 'workshop.trash', workshopId)
          return ok('Moved to the bin.')
        })
      }),
  )

  server.registerTool(
    'list_trash',
    {
      title: 'List the bin',
      description: 'The workshops in the bin, most recently binned first.',
      inputSchema: {},
    },
    async () =>
      guarded(async () => {
        requireScope(actor, 'workshops:read')
        const rows = await withTenant(actor, (tx) => listTrashedWorkshops(tx, actor))
        const workshops = rows.map((row) => ({
          id: row.id,
          title: row.title,
          deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
        }))
        if (workshops.length === 0) return ok('The bin is empty.', { workshops })
        return ok(workshops.map((w) => `${w.id}  ${w.title} (binned ${w.deletedAt})`).join('\n'), {
          workshops,
        })
      }),
  )

  server.registerTool(
    'restore_workshop',
    {
      title: 'Restore a workshop from the bin',
      description: 'Puts a binned workshop back where it was, with its folder and tags.',
      inputSchema: { workshopId: Id },
    },
    async ({ workshopId }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        return withTenant(actor, async (tx) => {
          const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.delete', {
            includeTrashed: true,
          })
          await restoreWorkshop(tx, access)
          await audit(tx, 'workshop', 'workshop.restore', workshopId)
          return ok('Restored.')
        })
      }),
  )

  server.registerTool(
    'purge_workshop',
    {
      title: 'Delete a workshop for good',
      description:
        'IRREVERSIBLE. Deletes a workshop that is already in the bin, with all its days and blocks. ' +
        'Refused for a workshop that is not in the bin. Only call this when the person explicitly ' +
        'asked for the workshop to be deleted permanently.',
      inputSchema: { workshopId: Id },
    },
    async ({ workshopId }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        return withTenant(actor, async (tx) => {
          const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.delete', {
            includeTrashed: true,
          })
          const removed = await purgeWorkshop(tx, access)
          // Not in the bin: "delete" and "delete for good" stay two decisions.
          if (removed === 0) throw new NotFoundError()
          await audit(tx, 'workshop', 'workshop.purge', workshopId)
          return ok('Deleted for good.')
        })
      }),
  )

  server.registerTool(
    'export_workshop',
    {
      title: 'Export workshop',
      description:
        'The whole workshop as one Markdown document: every day, in order. ' +
        'Use it to read a workshop as a text, to hand it on, or to keep a copy. ' +
        'Facilitation notes are left out unless asked for.',
      inputSchema: {
        workshopId: Id,
        flavor: z
          .enum(['agenda', 'outline'])
          .optional()
          .describe('agenda: a table per day. outline: headings and prose. Default agenda.'),
        locale: z
          .enum(LOCALES)
          .optional()
          .describe('The language the document is written in. Default the workspace language.'),
        notes: z
          .boolean()
          .optional()
          .describe('Include the facilitator\u2019s private notes. Default false.'),
      },
    },
    async ({ workshopId, flavor, locale, notes }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:read')
        return withTenant(actor, async (tx) => {
          // The same capability the HTTP export asks for, so a token can never
          // read through this what its member may not open in the app.
          const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.export')
          const { title, markdown } = await renderWorkshopExport(
            tx,
            access,
            locale ?? DEFAULT_LOCALE,
            { flavor: flavor ?? 'agenda', includePrivateFields: notes ?? false },
          )
          return ok(markdown, { title })
        })
      }),
  )
}
