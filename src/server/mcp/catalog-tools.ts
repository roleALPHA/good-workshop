import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { catalog } from '@gw/catalog'
import { adoptDesign } from '@/cloud/catalog/adopt'
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
 * `adopt_discover_design` calls the SAME function as the server action behind
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
    'list_discover_designs',
    {
      title: 'List Discover designs',
      description:
        'Ready-made workshop designs of one or more days, maintained by GoodWorkshop. Use ' +
        'adopt_discover_design to put one into this workspace. Filter with the values from ' +
        'list_discover_filters.',
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
        const page = await catalog.listDesigns({ ...query, locale: locale(asked) })
        if (page.items.length === 0) return ok('No design matches.')
        return ok(
          page.items
            .map((d) => `${d.id}  ${d.name} — ${d.dayCount} day(s), ${d.durationMinutes} min`)
            .join('\n'),
          { designs: page.items, nextCursor: page.nextCursor },
        )
      }),
  )

  server.registerTool(
    'get_discover_design',
    {
      title: 'Read a Discover design',
      description:
        'A design day by day: every block with its title and duration, in order. Read this and ' +
        'show it to the person before adopting anything.',
      inputSchema: { designId: Id, locale: LocaleInput },
    },
    async ({ designId, locale: asked }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:read')
        const design = await catalog.getDesign(designId, locale(asked))
        if (!design) return fail('No such design, or it is not published.')
        return ok(`${design.name}: ${design.dayCount} day(s).`, { design })
      }),
  )

  server.registerTool(
    'adopt_discover_design',
    {
      title: 'Adopt a Discover design',
      description:
        'Puts a Discover design into this workspace. Without `workshopId` it creates a new ' +
        'workshop whose days are the design’s; with one it appends those days behind the ' +
        'last day of that workshop. Never refuses a whole design over one block: a method ' +
        'whose block type this workspace does not have arrives as a note, and the answer says ' +
        'how many did. Call get_discover_design first and let the person see it.',
      inputSchema: {
        designId: Id,
        workshopId: Id.optional().describe(
          'Append the design’s days to this workshop. Leave it out to create a new one.',
        ),
        title: z
          .string()
          .trim()
          .max(300)
          .optional()
          .describe('Title of the new workshop. Only without workshopId; defaults to the design.'),
        folderId: Id.nullable()
          .optional()
          .describe('Files the new workshop in a folder. Only without workshopId.'),
        locale: LocaleInput,
      },
    },
    async ({ designId, workshopId, title, folderId, locale: asked }) =>
      guarded(async () => {
        requireScope(actor, 'workshops:write')
        const result = await adoptDesign(
          actor,
          (id) => roomEditor({ workshopId: id, authorization, presence: MODEL }),
          {
            designId,
            locale: locale(asked),
            target: workshopId
              ? { kind: 'append', workshopId }
              : { kind: 'new', title, folderId: folderId ?? null },
          },
        )

        // Every shortfall named. A model that reports "done" over a design
        // that lost a third of its blocks is the failure the tallies exist
        // for, and it is the person who finds out in the room.
        const notes = [
          result.degraded > 0 && `${result.degraded} block(s) arrived as notes: no such type here.`,
          result.descsDropped > 0 &&
            `${result.descsDropped} description(s) did not fit this workspace’s block types.`,
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
