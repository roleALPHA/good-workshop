import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { catalog } from '@gw/catalog'
import { adoptEntry } from '@/cloud/catalog/adopt'
import { roomEditor } from '@/server/collab/across-days'
import { LOCALES, type Locale } from '@/i18n/config'
import type { PatActor } from './auth'
import { requireScope } from './auth'
import { fail, guarded, ok } from './respond'

/**
 * Discover, for a model.
 *
 * Reading the catalogue takes `workshops:read` and adopting takes
 * `workshops:write` -- no scope of its own, deliberately. A scope answers "what
 * may this token do to the workspace", and Discover's only effect on a
 * workspace is creating workshops and days. Adding one would also break every
 * token already issued, because `resolve_pat` returns the scopes stored on the
 * row and nobody re-creates a token they did not know had gone stale.
 *
 * The reads run OUTSIDE `withTenant`, unlike every other tool here. The
 * catalogue has no tenant_id: one library serves everybody, and wrapping the
 * query in a tenant transaction would imply a policy is filtering it when none
 * is. What protects those tables is a SELECT-only policy -- see the private
 * migration.
 *
 * `adopt_discover_entry` calls the SAME function as the server action behind
 * the button. docs/architecture.md makes that a rule -- "a model can do what
 * the library and the day editor let a person do" -- and one function is the
 * only way to keep it true.
 */

const Id = z.string().uuid()
const LocaleInput = z
  .enum(LOCALES)
  .optional()
  .describe('The language to read in. Defaults to English, which every entry is written in.')

const Facets = z
  .record(z.string(), z.array(z.string()))
  .optional()
  .describe(
    'Filter values from list_discover_filters, keyed by filter. Every value given is a ' +
      'requirement: asking for "seated" and "no_reading" finds what is both, not either.',
  )

export function registerCatalogTools(
  server: McpServer,
  { actor, authorization }: { actor: PatActor; authorization: string },
): void {
  const locale = (input: Locale | undefined): Locale => input ?? 'en'
  server.registerTool(
    'list_discover_filters',
    {
      title: 'List the Discover filters',
      description:
        'The vocabulary the Discover library is filtered by: each filter with the values it ' +
        'currently has. The values are maintained without a release and change over time, so ' +
        'read them here rather than guessing one.',
      inputSchema: { locale: LocaleInput },
    },
    async ({ locale: asked }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:read')
        const facets = await catalog.listFacets(locale(asked))
        if (facets.length === 0) return ok('The Discover library has no filters yet.')
        return ok(
          facets
            .map((f) => `${f.kind}: ${f.values.map((v) => `${v.key} (${v.label})`).join(', ')}`)
            .join('\n'),
          { facets },
        )
      }),
  )

  server.registerTool(
    'list_discover_entries',
    {
      title: 'List Discover',
      description:
        'The Discover library, newest first: curated entries a workspace can adopt. An entry ' +
        'is a day or several -- a building block like a check-in round, or a whole programme ' +
        'like an Open Space. `days` tells them apart, and `durationMinutes` is what the entry ' +
        'is advertised at. Filter with the values from list_discover_filters.',
      inputSchema: {
        facets: Facets,
        groupSize: z.number().int().min(1).max(10_000).optional(),
        maxMinutes: z.number().int().min(1).optional(),
        search: z.string().trim().max(200).optional(),
        cursor: z.string().max(400).optional(),
        locale: LocaleInput,
      },
    },
    async ({ locale: asked, ...query }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:read')
        const page = await catalog.listEntries({ ...query, locale: locale(asked) })
        if (page.items.length === 0) return ok('Nothing in Discover matches.')
        return ok(
          page.items
            .map(
              (entry) =>
                `${entry.id}  ${entry.name} — ${entry.dayCount} day(s), ${entry.durationMinutes} min`,
            )
            .join('\n'),
          { entries: page.items, nextCursor: page.nextCursor },
        )
      }),
  )

  server.registerTool(
    'get_discover_entry',
    {
      title: 'Read a Discover entry',
      description:
        'One entry day by day: every block with its title and duration, in order. Read this ' +
        'and show it to the person before adopting anything. Addressed by the id ' +
        'list_discover_entries gives, never by the address a public entry also has.',
      inputSchema: { entryId: Id, locale: LocaleInput },
    },
    async ({ entryId, locale: asked }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:read')
        const entry = await catalog.getEntry(entryId, locale(asked))
        if (!entry) return fail('No such entry, or it is not published.')
        return ok(`${entry.name}: ${entry.dayCount} day(s).`, { entry })
      }),
  )

  server.registerTool(
    'adopt_discover_entry',
    {
      title: 'Adopt a Discover entry',
      description:
        'Puts a Discover entry into this workspace, as a copy -- a later correction to the ' +
        'catalogue never reaches back into somebody’s agenda. Three targets: with neither ' +
        'workshopId nor dayId it creates a workshop whose days are the entry’s; with ' +
        'workshopId it appends those days behind the last day of that workshop; with BOTH ' +
        'workshopId and dayId it puts the entry’s blocks at the end of that day, which only ' +
        'works for a ONE-DAY entry and is how a building block is meant to arrive. Use ' +
        'list_days to find the day and let the person choose it. It never changes the day ' +
        'itself: the title and start time it already has are left alone. A block whose type ' +
        'this workspace does not have arrives as a note, and the answer says how many did.',
      inputSchema: {
        entryId: Id,
        workshopId: Id.optional().describe(
          'Append the entry’s days to this workshop, or -- with dayId -- the workshop that day ' +
            'belongs to. Leave it out to create a new workshop.',
        ),
        dayId: Id.optional().describe(
          'Put the blocks at the end of this day. Needs workshopId, and a one-day entry.',
        ),
        title: z
          .string()
          .trim()
          .max(300)
          .optional()
          .describe('Title of the new workshop. Only without workshopId; defaults to the entry.'),
        folderId: Id.nullable()
          .optional()
          .describe('Files the new workshop in a folder. Only without workshopId.'),
        locale: LocaleInput,
      },
    },
    async ({ entryId, workshopId, dayId, title, folderId, locale: asked }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        if (dayId && !workshopId) {
          return fail('A dayId needs the workshopId of the workshop it belongs to.')
        }

        const result = await adoptEntry(
          actor,
          (id) => roomEditor({ workshopId: id, authorization, presence: MODEL }),
          {
            entryId,
            locale: locale(asked),
            target:
              workshopId && dayId
                ? { kind: 'day', workshopId, dayId }
                : workshopId
                  ? { kind: 'append', workshopId }
                  : { kind: 'new', title, folderId: folderId ?? null },
          },
        )

        const notes = [
          result.degraded > 0 && `${result.degraded} block(s) arrived as notes: no such type here.`,
          result.descsDropped > 0 &&
            `${result.descsDropped} block(s) lost fields this workspace’s block type refused.`,
          result.daysFailed > 0 &&
            `${result.daysFailed} day(s) could not be written and are empty.`,
        ].filter((note): note is string => typeof note === 'string')

        return ok(
          [
            `Adopted into workshop ${result.workshopId}, ${result.dayIds.length} day(s).`,
            ...notes,
          ].join(' '),
          result,
        )
      }),
  )
}

/**
 * How the adoption appears in the room, the same way apply_agenda does.
 *
 * Somebody watching their agenda fill under their hands is owed the difference
 * between a colleague and something a colleague pointed at their workshop.
 */
const MODEL = { name: 'KI-Assistent', hue: 292, kind: 'model' as const }
