import { z } from 'zod'
import { LOCALES } from '@/i18n/config'
import { blockTypeCatalogue, describeBlockTypes, normaliseDays } from './block-types'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { fail, ok } from '@/server/mcp/respond'
import { opGuarded } from './mcp-respond'
import { applyOperatorAction, listTenants, listMaintenance, tenantDetail } from './console'
import {
  listCatalogEntries,
  listCatalogFacets,
  retireCatalogFacet,
  saveCatalogEntry,
  saveCatalogFacet,
  setCatalogBlocks,
  setCatalogStatus,
} from './catalog'
import { disconnectOperatorClient, listOperatorConnections } from './oauth'
import { actionFrom, stageAction, takeAction, type ConfirmedKind } from './pending'
import { requireOperatorScope } from './scopes'
import type { OperatorActor } from './tokens'
import { operatorDb } from './db'

/**
 * The operator console, for a model.
 *
 * WHY THIS IS NOT AT /api/mcp, and cannot be: that endpoint runs in the public
 * web container as gw_app, and gw_app has EXECUTE on none of the app.op_*
 * functions. Postgres refuses before any code here would. The separation is
 * the strongest boundary in the system and this file lives on the other side
 * of it.
 *
 * WHY THIS IS ALLOWED AT ALL, given that docs/architecture.md says an MCP
 * client must never reach administration: that sentence is about a CUSTOMER'S
 * token reaching a workspace's members and access. This is a different
 * subject (the platform, not a workspace), a different endpoint, a different
 * database role, a different network and a different credential -- and it
 * cannot read a single workshop. The doc gains a section saying so; without
 * it the sentence becomes false the day this ships.
 *
 * Destructive actions are staged and confirmed. The second call takes no
 * arguments of its own, so it can only do the thing that was described.
 */

const Id = z.string().uuid()
const Reason = z.string().trim().min(3).max(500)
const Days = z.number().int().min(1).max(90)

export function registerOperatorTools(server: McpServer, actor: OperatorActor): void {
  const db = operatorDb()

  // ── Reads ────────────────────────────────────────────────────────────────

  server.registerTool(
    'list_tenants',
    {
      title: 'List workspaces',
      description:
        'Every workspace with its state, plan, member and workshop counts, and whether any ' +
        'billing period is held or failed. Figures only: no workshop content ever crosses this ' +
        'boundary.',
      inputSchema: {},
    },
    async () =>
      opGuarded(async () => {
        requireOperatorScope(actor.scopes, 'ops:read')
        const tenants = await listTenants(db)
        return ok(
          tenants.map((t) => `${t.id}  ${t.name}  ${t.state}/${t.status}`).join('\n') ||
            'No workspaces.',
          { tenants },
        )
      }),
  )

  server.registerTool(
    'list_connections',
    {
      title: 'List connected clients',
      description:
        'The applications that currently hold an OAuth token for this operator, one row each ' +
        'with the scopes they were granted and when they last acted. Not a list of tokens: an ' +
        'access token lasts an hour, so a connected client mints twenty-four a day.',
      inputSchema: {},
    },
    async () =>
      opGuarded(async () => {
        requireOperatorScope(actor.scopes, 'ops:read')
        const connections = await listOperatorConnections(db, actor.operatorId)
        return ok(
          connections.map((c) => `${c.clientId}  ${c.name}  ${c.scopes.join(' ')}`).join('\n') ||
            'Nothing is connected.',
          { connections },
        )
      }),
  )

  server.registerTool(
    'disconnect_client',
    {
      title: 'Disconnect a client',
      description:
        'Revokes every token one client holds, both kinds at once. Revoking only the access ' +
        'token would leave a refresh token that mints another within the minute. This can end ' +
        "the caller's own connection, which is a legitimate thing to ask for and takes effect " +
        'immediately.',
      inputSchema: { clientId: Id },
    },
    async ({ clientId }) =>
      opGuarded(async () => {
        // Not staged, unlike the destructive tenant actions. Nothing is lost
        // and nobody else is affected: the worst outcome is that whoever asked
        // has to connect again, which is the same cost as the confirmation
        // step would have been.
        requireOperatorScope(actor.scopes, 'ops:lifecycle')
        const count = await disconnectOperatorClient(db, actor.operatorId, clientId)
        return count === 0
          ? fail('That client holds nothing of yours.')
          : ok(`Disconnected. ${count} token(s) revoked.`, { revoked: count })
      }),
  )

  server.registerTool(
    'get_tenant',
    {
      title: 'Read one workspace',
      description: 'One workspace in full, with its billing periods and its last audit entries.',
      inputSchema: { tenantId: Id },
    },
    async ({ tenantId }) =>
      opGuarded(async () => {
        requireOperatorScope(actor.scopes, 'ops:read')
        const detail = await tenantDetail(db, tenantId)
        if (!detail) return fail('No such workspace.')
        return ok(`${detail.tenant.name}: ${detail.tenant.state}/${detail.tenant.status}`, {
          detail,
        })
      }),
  )

  server.registerTool(
    'list_maintenance',
    {
      title: 'List maintenance windows',
      description: 'Announced maintenance, including what has been cancelled.',
      inputSchema: {},
    },
    async () =>
      opGuarded(async () => {
        requireOperatorScope(actor.scopes, 'ops:read')
        return ok('Maintenance windows.', { windows: await listMaintenance(db) })
      }),
  )

  // ── Reversible changes ───────────────────────────────────────────────────
  //
  // Written out one by one rather than through a helper. A loop over them
  // would be shorter and would have to describe its own input types, which is
  // how a tool ends up accepting something its handler cannot read.

  const lifecycle = async (
    tenantId: string,
    action: Parameters<typeof applyOperatorAction>[3],
    said: string,
  ) => {
    requireOperatorScope(actor.scopes, 'ops:lifecycle')
    await applyOperatorAction(db, actor.operatorId, tenantId, action)
    return ok(said)
  }

  server.registerTool(
    'pause_tenant',
    {
      title: 'Pause a workspace',
      description: 'Everybody keeps reading, nobody writes. Billing continues.',
      inputSchema: { tenantId: Id, reason: Reason },
    },
    async ({ tenantId, reason }) =>
      opGuarded(() => lifecycle(tenantId, { kind: 'pause', reason }, 'Workspace paused.')),
  )

  server.registerTool(
    'unpause_tenant',
    {
      title: 'Lift a pause',
      description: 'The workspace can be written in again.',
      inputSchema: { tenantId: Id, reason: Reason },
    },
    async ({ tenantId, reason }) =>
      opGuarded(() => lifecycle(tenantId, { kind: 'unpause', reason }, 'Pause lifted.')),
  )

  server.registerTool(
    'unblock_tenant',
    {
      title: 'Lift a block',
      description: 'People can sign in again. Blocking is the confirmed direction.',
      inputSchema: { tenantId: Id, reason: Reason },
    },
    async ({ tenantId, reason }) =>
      opGuarded(() => lifecycle(tenantId, { kind: 'unblock', reason }, 'Block lifted.')),
  )

  server.registerTool(
    'extend_trial',
    {
      title: 'Extend a trial',
      description: 'Moves the end of a trial out by up to ninety days.',
      inputSchema: { tenantId: Id, days: Days },
    },
    async ({ tenantId, days }) =>
      opGuarded(() => lifecycle(tenantId, { kind: 'extend_trial', days }, 'Trial extended.')),
  )

  server.registerTool(
    'grant_grace',
    {
      title: 'Grant grace',
      description: 'More time before a payment state catches up with a workspace.',
      inputSchema: { tenantId: Id, days: Days, reason: Reason },
    },
    async ({ tenantId, days, reason }) =>
      opGuarded(() => lifecycle(tenantId, { kind: 'grant_grace', days, reason }, 'Grace granted.')),
  )

  server.registerTool(
    'cancel_deletion',
    {
      title: 'Cancel a scheduled deletion',
      description: 'Takes a workspace off the deletion schedule.',
      inputSchema: { tenantId: Id },
    },
    async ({ tenantId }) =>
      opGuarded(() => lifecycle(tenantId, { kind: 'cancel_deletion' }, 'Deletion cancelled.')),
  )

  server.registerTool(
    'bill_period',
    {
      title: 'Release a held period for billing',
      description:
        'Lets a held billing period be invoiced. Writing one off instead is confirmed, because ' +
        'it cannot be undone.',
      inputSchema: { tenantId: Id, periodId: Id },
    },
    async ({ tenantId, periodId }) =>
      opGuarded(() =>
        lifecycle(
          tenantId,
          { kind: 'release_period', periodId, decision: 'bill' },
          'Period released for billing.',
        ),
      ),
  )

  server.registerTool(
    'announce_maintenance',
    {
      title: 'Announce maintenance',
      description: 'A window everybody sees in their workspace, announced in advance.',
      inputSchema: {
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
        note: z.string().trim().max(500),
      },
    },
    async ({ startsAt, endsAt, note }) =>
      opGuarded(async () => {
        requireOperatorScope(actor.scopes, 'ops:maintenance')
        await applyOperatorAction(db, actor.operatorId, null, {
          kind: 'announce_maintenance',
          startsAt,
          endsAt,
          note,
        })
        return ok('Maintenance announced.')
      }),
  )

  server.registerTool(
    'cancel_maintenance',
    {
      title: 'Cancel a maintenance window',
      description: 'Withdraws an announced window.',
      inputSchema: { windowId: Id },
    },
    async ({ windowId }) =>
      opGuarded(async () => {
        requireOperatorScope(actor.scopes, 'ops:maintenance')
        await applyOperatorAction(db, actor.operatorId, null, {
          kind: 'cancel_maintenance',
          windowId,
        })
        return ok('Maintenance cancelled.')
      }),
  )

  // ── Destructive: described first, performed second ───────────────────────

  const stage = async (
    kind: ConfirmedKind,
    tenantId: string | null,
    args: Record<string, unknown>,
    what: string,
  ) => {
    requireOperatorScope(actor.scopes, 'ops:danger')
    const staged = await stageAction(db, actor.operatorId, kind, tenantId, args)
    return ok(
      `${what}\nShow this to whoever asked for it, then call confirm_operator_action.\n` +
        `handle=${staged.id} confirm=${staged.digest} (five minutes)`,
      { handle: staged.id, confirm: staged.digest, expiresAt: staged.expiresAt },
    )
  }

  server.registerTool(
    'block_tenant',
    {
      title: 'Block a workspace',
      description:
        'Describes what blocking this workspace would do and returns a handle. Nothing changes ' +
        'until confirm_operator_action is called with it. Nobody gets in afterwards and every ' +
        'session ends at its next request.',
      inputSchema: { tenantId: Id, reason: Reason },
    },
    async ({ tenantId, reason }) =>
      opGuarded(async () => {
        const detail = await tenantDetail(db, tenantId)
        if (!detail) return fail('No such workspace.')
        return stage(
          'block',
          tenantId,
          { reason },
          `This will block "${detail.tenant.name}" (${detail.tenant.members} member(s), ` +
            `${detail.tenant.workshops} workshop(s)). Nobody gets in.`,
        )
      }),
  )

  server.registerTool(
    'schedule_deletion',
    {
      title: 'Schedule a workspace for deletion',
      description:
        'Describes what deleting this workspace would do and returns a handle. Nothing changes ' +
        'until confirm_operator_action is called with it.',
      inputSchema: { tenantId: Id, days: z.number().int().min(0).max(90), reason: Reason },
    },
    async ({ tenantId, days, reason }) =>
      opGuarded(async () => {
        const detail = await tenantDetail(db, tenantId)
        if (!detail) return fail('No such workspace.')
        return stage(
          'schedule_deletion',
          tenantId,
          { days, reason },
          `This will schedule "${detail.tenant.name}" for deletion in ${days} day(s), with ` +
            `${detail.tenant.workshops} workshop(s) in it.`,
        )
      }),
  )

  server.registerTool(
    'announce_terms',
    {
      title: 'Announce a new version of a legal document',
      description:
        'Describes the announcement and returns a handle. It binds every customer, so nothing ' +
        'happens until confirm_operator_action is called with it.',
      inputSchema: {
        document: z.enum(['impressum', 'agb', 'datenschutz', 'avv']),
        version: z.string().trim().max(40),
        effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
      },
    },
    async ({ document, version, effectiveFrom }) =>
      opGuarded(async () =>
        stage(
          'announce_terms',
          null,
          { document, version, effectiveFrom },
          `This will tell EVERY customer that ${document} version ${version} applies from ` +
            `${effectiveFrom}.`,
        ),
      ),
  )

  server.registerTool(
    'void_period',
    {
      title: 'Write off a held billing period',
      description:
        'Describes writing off this period and returns a handle. The money is not billed and ' +
        'the period cannot be billed again, so nothing happens until confirm_operator_action.',
      inputSchema: { tenantId: Id, periodId: Id },
    },
    async ({ tenantId, periodId }) =>
      opGuarded(async () =>
        stage('release_period_void', tenantId, { periodId }, 'This will write off the period.'),
      ),
  )

  // ── The Discover catalogue ───────────────────────────────────────────────
  //
  // Whole documents rather than one tool per field, for the reason
  // apply_agenda exists: twenty dependent calls is where a model loses the
  // thread, and a half-written method is worse than an unwritten one.
  //
  // Authoring and publishing are separate scopes on purpose. A token handed to
  // a model for bulk import should be able to fill the catalogue and unable to
  // make any of it live.

  // Not `z.record(z.enum(LOCALES), ...)`: Zod reads an enum key as "every one
  // of these", and a method translated into two languages is the normal case
  // rather than an error. The locale itself is checked by catalog_text's own
  // constraint, which is the one that cannot be forgotten.
  // THREE LEVELS, THREE SETS OF FIELD NAMES, and one shared description used
  // to claim otherwise. An author who wrote `name` on a block -- the habit the
  // entry level teaches -- got a block that rendered as a bare duration with no
  // word beside it, and nothing anywhere said why. The reader now takes either
  // spelling; these descriptions say which one is meant.
  const localised = (fields: string) =>
    z
      .record(z.string(), z.record(z.string(), z.string()))
      .describe(
        `Per language. ${fields} English is the source and is required: everything else ` +
          'falls back to it, per field rather than per row.',
      )

  const Text = localised(
    'For the ENTRY: `name`, `summary`, `body`, and `slug` where it should have a public page ' +
      '-- leave the slug out and it is readable in Discover only.',
  )

  const DayText = localised('For a DAY: `title`. Leave it out and the day is shown as "Day 1".')

  const BlockText = localised(
    'For a BLOCK: `title` -- the line somebody reads in the agenda -- and `desc`, a sentence ' +
      'about this step. NOT `name`/`summary`/`body`: those are the entry’s words. A block ' +
      'without a title renders as a duration and nothing else.',
  )

  server.registerTool(
    'list_catalog_entries',
    {
      title: 'List the catalogue',
      description:
        'Every entry, published or not, with its days, its blocks and all four languages. ' +
        'Pass an id to read one in full. One sort of entry: a building block is one day, a ' +
        'programme is several.',
      inputSchema: { entryId: Id.optional() },
    },
    async ({ entryId }) =>
      opGuarded(async () => {
        requireOperatorScope(actor.scopes, 'ops:read')
        const entries = await listCatalogEntries(db, entryId)
        return ok(`${entries.length} entry/entries.`, { entries })
      }),
  )

  server.registerTool(
    'list_catalog_filters',
    {
      title: 'List the filter vocabulary',
      description:
        'The filter vocabulary with its values and their labels. Read this before tagging ' +
        'anything: the values are maintained here and change without a release.',
      inputSchema: {},
    },
    async () =>
      opGuarded(async () => {
        requireOperatorScope(actor.scopes, 'ops:read')
        const filters = await listCatalogFacets(db)
        return ok(`${filters.length} filter(s).`, { filters })
      }),
  )

  server.registerTool(
    'list_catalog_block_types',
    {
      title: 'List the block types an entry is built from',
      description:
        'The vocabulary a catalogue entry is written in: which `moduleTypeKey` values exist ' +
        'and, for each, the name of every field, its TYPE and the values it allows. Read this ' +
        'BEFORE set_catalog_blocks.\n\n' +
        'READING THE FIELD LIST. `participation: plenary|small_groups|pairs|individual|none` ' +
        'means those five words and no others. `materials: string[]` is a list -- ' +
        '["Marker", "Tape"], not "Marker, Tape". `richtext` is a document, but WRITE IT AS ' +
        'MARKDOWN: a plain string in a rich-text field is converted for you. ' +
        '`timebox_per_person_seconds: integer` is a number, not "60". The `jsonSchema` in the ' +
        'structured result is the full truth if the summary leaves you guessing.\n\n' +
        'A wrong field is refused by set_catalog_blocks, naming the day, the block and what ' +
        'that field takes -- so a rejected call is fixable rather than a mystery.\n\n' +
        'HOW A CATALOGUE ENTRY IS WRITTEN, in three calls:\n' +
        '1. save_catalog_entry -- the name, the summary, the prose, the advertised duration, ' +
        'the group size, the tags. This writes NO agenda.\n' +
        '2. set_catalog_blocks -- the days and the steps. A building block is ONE day holding ' +
        'ONE cluster with its steps inside; a programme like an Open Space is several days. ' +
        'Each step is a module naming a block type from this list, with its own duration and ' +
        'its `fields` filled in -- that is what somebody gets when they adopt it.\n' +
        '3. publish_catalog_entry -- per language, and refused while the entry has no days.\n\n' +
        'The prose from step 1 and the steps from step 2 are different things and both belong: ' +
        'the prose explains the method, the blocks ARE the agenda.',
      inputSchema: {},
    },
    async () =>
      opGuarded(async () => {
        requireOperatorScope(actor.scopes, 'ops:read')
        const types = blockTypeCatalogue()
        // The summary names each field's type and, where it has one, the only
        // values it takes; `jsonSchema` alongside it is the whole truth. It
        // used to be `Object.keys(properties)` -- the names alone, which is
        // how `prompt` gets written as a sentence and dropped on adoption.
        return ok(describeBlockTypes(types), { blockTypes: types })
      }),
  )

  server.registerTool(
    'save_catalog_entry',
    {
      title: 'Write a catalogue entry',
      description:
        'Creates or replaces one entry’s own fields, whole: name, summary, prose, duration, ' +
        'group size, tags. Keyed on `key`, so saving again updates and the id stays put. ' +
        'THIS IS STEP ONE OF TWO. It writes no days and no blocks -- an entry saved and left ' +
        'here has no agenda, cannot be adopted and cannot be published. Follow it with ' +
        'set_catalog_blocks, which writes the steps somebody actually gets when they adopt it. ' +
        'Publishing is a third call with a scope of its own.',
      inputSchema: {
        key: z.string().regex(/^[a-z][a-z0-9_]{1,48}$/u),
        durationMinutes: z
          .number()
          .int()
          .min(0)
          .max(43_200)
          .describe(
            'What the entry is advertised at, including arrival, breaks and buffer -- not the ' +
              'sum of its blocks.',
          ),
        groupSize: z
          .string()
          .optional()
          .describe('A Postgres range like "[8,21)" -- 8 to 20 people. Leave out for any size.'),
        facets: z
          .array(z.string())
          .optional()
          .describe('Leave it out to keep the tags an entry already has; give it to replace them.'),
        text: Text,
      },
    },
    async (draft) =>
      opGuarded(async () => {
        requireOperatorScope(actor.scopes, 'catalog:author')
        const id = await saveCatalogEntry(db, actor.operatorId, draft)
        // Say what is still missing rather than leaving it to be remembered.
        // Two entries went live with no agenda at all because the second call
        // was easy to forget and nothing here mentioned it afterwards.
        const [saved] = await listCatalogEntries(db, id)
        const days = saved?.days.length ?? 0
        return ok(
          days === 0
            ? `Entry "${draft.key}" saved. It has NO days yet: call set_catalog_blocks with its ` +
                'steps, or it cannot be published or adopted.'
            : `Entry "${draft.key}" saved, ${days} day(s) already written.`,
          { id, days },
        )
      }),
  )

  server.registerTool(
    'set_catalog_blocks',
    {
      title: 'Write an entry’s days and blocks',
      description:
        'Every day of an entry, with its blocks, in one call -- the catalogue’s apply_agenda. ' +
        'Replaces what is there. Every entry has at least one day: a building block is one day ' +
        'holding one cluster with its steps inside, a programme is several. A module names its ' +
        'BLOCK TYPE by key -- read list_catalog_block_types for the keys and the fields each ' +
        'one takes -- and the cluster it sits in by that cluster’s ordinal on the same day. ' +
        '`fields` is what the adopted block starts with in that type’s own fields -- prompt, ' +
        'materials, participation and the rest -- and it is the reason an adopted block is a ' +
        'filled-in step rather than a wall of prose.',
      inputSchema: {
        entryId: Id,
        days: z.array(
          z.object({
            ordinal: z.number().int().min(1).max(60),
            startMinute: z.number().int().min(0).max(1439).optional(),
            text: DayText.optional(),
            blocks: z.array(
              z.object({
                ordinal: z.number().int().min(1),
                kind: z.enum(['cluster', 'module']),
                parentOrdinal: z.number().int().min(1).optional(),
                moduleTypeKey: z.string().optional(),
                durationMinutes: z.number().int().min(0).max(1440).optional(),
                pinnedStartMinute: z.number().int().min(0).max(1439).optional(),
                parked: z.boolean().optional(),
                color: z.string().optional(),
                fields: z
                  .record(z.string(), z.unknown())
                  .optional()
                  .describe(
                    'The block type’s OWN fields, from list_catalog_block_types -- `prompt`, ' +
                      '`materials`, `participation` and so on. Plain values, not per language: ' +
                      'they are carried into the adopted block as they are. The words a reader ' +
                      'sees in Discover go in `text`, not here.\n' +
                      'TYPES MATTER and are checked: an enum takes one of its listed words, a ' +
                      'list takes an array, a number takes a number. A rich-text field takes ' +
                      'Markdown as a plain string and is converted. Anything else is refused ' +
                      'with the field named -- nothing is silently dropped.',
                  ),
                text: BlockText.optional(),
              }),
            ),
          }),
        ),
      },
    },
    async ({ entryId, days }) =>
      opGuarded(async () => {
        requireOperatorScope(actor.scopes, 'catalog:author')
        // Before the write, not after: a field the block type does not have is
        // refused here, where whoever wrote it can fix it. Accepted, it is
        // stored and then dropped by `descFor` during somebody else's
        // adoption -- the failure the author never sees.
        await setCatalogBlocks(db, actor.operatorId, entryId, normaliseDays(days))
        return ok(`${days.length} day(s) written.`)
      }),
  )

  server.registerTool(
    'save_catalog_filter_value',
    {
      title: 'Add or rename a filter value',
      description:
        'One value of one filter, with its labels. This is what makes a new inclusivity ' +
        'property possible without a release.',
      inputSchema: {
        group: z.string().describe('Which filter, by key: purpose, setting, inclusivity, social.'),
        key: z.string().regex(/^[a-z][a-z0-9_]{1,48}$/u),
        sortOrder: z.number().int().optional(),
        text: Text,
      },
    },
    async (draft) =>
      opGuarded(async () => {
        requireOperatorScope(actor.scopes, 'catalog:author')
        const id = await saveCatalogFacet(db, actor.operatorId, draft)
        return ok(`Filter value "${draft.key}" saved.`, { id })
      }),
  )

  server.registerTool(
    'retire_catalog_filter_value',
    {
      title: 'Withdraw a filter value',
      description:
        'Stops offering a value without deleting it. Anything already tagged keeps its tag, and ' +
        'a bookmarked filter asking for it is simply ignored rather than matching nothing.',
      inputSchema: { facetId: Id },
    },
    async ({ facetId }) =>
      opGuarded(async () => {
        requireOperatorScope(actor.scopes, 'catalog:author')
        await retireCatalogFacet(db, actor.operatorId, facetId)
        return ok('Filter value withdrawn.')
      }),
  )

  server.registerTool(
    'publish_catalog_entry',
    {
      title: 'Make a catalogue entry live',
      description:
        'Per language, because each language is its own public address. An entry that carries ' +
        'a slug in any language needs one in every language it is published in -- that is what ' +
        'keeps a 404 out of the sitemap. An entry with no slug at all publishes freely: it is ' +
        'then visible in Discover and has no public page, which is what most of the catalogue ' +
        'is. An entry with no days at all is refused: what is live has to be something ' +
        'somebody can adopt.',
      inputSchema: {
        id: Id,
        locales: z.array(z.enum(LOCALES)).optional(),
        published: z.boolean().default(true),
      },
    },
    async ({ id, locales, published }) =>
      opGuarded(async () => {
        requireOperatorScope(actor.scopes, 'catalog:publish')
        await setCatalogStatus(db, actor.operatorId, id, locales ?? [], published)
        return ok(published ? 'Published.' : 'Withdrawn.')
      }),
  )

  server.registerTool(
    'confirm_operator_action',
    {
      title: 'Perform a staged action',
      description:
        'Performs what a previous call described. `handle` and `confirm` are what that call ' +
        'returned. This call takes NO arguments of its own: what happens comes from what was ' +
        'staged, so it can only do the thing that was described. A handle works once and ' +
        'expires after five minutes.',
      inputSchema: { handle: Id, confirm: z.string().length(8) },
    },
    async ({ handle, confirm }) =>
      opGuarded(async () => {
        requireOperatorScope(actor.scopes, 'ops:danger')
        const staged = await takeAction(db, actor.operatorId, handle, confirm)
        // Wrong digits, somebody else's handle, already used, expired: one
        // answer for all of them. A bad confirmation gets "there is nothing to
        // confirm", not a hint about what would have worked.
        if (!staged) return fail('There is nothing to confirm under that handle.')

        const action = actionFrom(staged.kind, staged.args)
        if (!action) return fail(`Staged action "${staged.kind}" is not one this server performs.`)

        await applyOperatorAction(db, actor.operatorId, staged.tenantId, action)
        return ok(`Done: ${staged.kind}.`)
      }),
  )
}
