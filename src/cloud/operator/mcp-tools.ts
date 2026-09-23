import { z } from 'zod'
import { LOCALES } from '@/i18n/config'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { fail, guarded, ok } from '@/server/mcp/respond'
import { applyOperatorAction, listTenants, listMaintenance, tenantDetail } from './console'
import {
  listCatalogDesigns,
  listCatalogFacets,
  listCatalogMethods,
  retireCatalogFacet,
  saveCatalogDesign,
  saveCatalogFacet,
  saveCatalogMethod,
  setCatalogDays,
  setCatalogStatus,
} from './catalog'
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
      guarded(async () => {
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
    'get_tenant',
    {
      title: 'Read one workspace',
      description: 'One workspace in full, with its billing periods and its last audit entries.',
      inputSchema: { tenantId: Id },
    },
    async ({ tenantId }) =>
      guarded(async () => {
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
      guarded(async () => {
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
      guarded(() => lifecycle(tenantId, { kind: 'pause', reason }, 'Workspace paused.')),
  )

  server.registerTool(
    'unpause_tenant',
    {
      title: 'Lift a pause',
      description: 'The workspace can be written in again.',
      inputSchema: { tenantId: Id, reason: Reason },
    },
    async ({ tenantId, reason }) =>
      guarded(() => lifecycle(tenantId, { kind: 'unpause', reason }, 'Pause lifted.')),
  )

  server.registerTool(
    'unblock_tenant',
    {
      title: 'Lift a block',
      description: 'People can sign in again. Blocking is the confirmed direction.',
      inputSchema: { tenantId: Id, reason: Reason },
    },
    async ({ tenantId, reason }) =>
      guarded(() => lifecycle(tenantId, { kind: 'unblock', reason }, 'Block lifted.')),
  )

  server.registerTool(
    'extend_trial',
    {
      title: 'Extend a trial',
      description: 'Moves the end of a trial out by up to ninety days.',
      inputSchema: { tenantId: Id, days: Days },
    },
    async ({ tenantId, days }) =>
      guarded(() => lifecycle(tenantId, { kind: 'extend_trial', days }, 'Trial extended.')),
  )

  server.registerTool(
    'grant_grace',
    {
      title: 'Grant grace',
      description: 'More time before a payment state catches up with a workspace.',
      inputSchema: { tenantId: Id, days: Days, reason: Reason },
    },
    async ({ tenantId, days, reason }) =>
      guarded(() => lifecycle(tenantId, { kind: 'grant_grace', days, reason }, 'Grace granted.')),
  )

  server.registerTool(
    'cancel_deletion',
    {
      title: 'Cancel a scheduled deletion',
      description: 'Takes a workspace off the deletion schedule.',
      inputSchema: { tenantId: Id },
    },
    async ({ tenantId }) =>
      guarded(() => lifecycle(tenantId, { kind: 'cancel_deletion' }, 'Deletion cancelled.')),
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
      guarded(() =>
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
      guarded(async () => {
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
      guarded(async () => {
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
      guarded(async () => {
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
      guarded(async () => {
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
      guarded(async () =>
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
      guarded(async () =>
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

  const Text = z
    .record(z.enum(LOCALES), z.record(z.string(), z.string()))
    .describe(
      'Per language. `name`, `summary`, `body`, and for a method `slug`, which is its public ' +
        'address. English is the source and is required: everything else falls back to it.',
    )

  server.registerTool(
    'list_catalog_methods',
    {
      title: 'List catalogue methods',
      description:
        'Every method, published or not, with all four languages and which of them are live. ' +
        'Pass an id to read one in full.',
      inputSchema: { methodId: Id.optional() },
    },
    async ({ methodId }) =>
      guarded(async () => {
        requireOperatorScope(actor.scopes, 'ops:read')
        return ok('Catalogue methods.', { methods: await listCatalogMethods(db, methodId) })
      }),
  )

  server.registerTool(
    'list_catalog_designs',
    {
      title: 'List catalogue designs',
      description: 'Every design with its days and blocks, in all four languages.',
      inputSchema: { designId: Id.optional() },
    },
    async ({ designId }) =>
      guarded(async () => {
        requireOperatorScope(actor.scopes, 'ops:read')
        return ok('Catalogue designs.', { designs: await listCatalogDesigns(db, designId) })
      }),
  )

  server.registerTool(
    'list_catalog_filters',
    {
      title: 'List the catalogue filters',
      description:
        'The filter vocabulary with its values and their labels. Read this before tagging ' +
        'anything: the values are maintained here and change without a release.',
      inputSchema: {},
    },
    async () =>
      guarded(async () => {
        requireOperatorScope(actor.scopes, 'ops:read')
        return ok('Catalogue filters.', { filters: await listCatalogFacets(db) })
      }),
  )

  server.registerTool(
    'save_catalog_method',
    {
      title: 'Write a catalogue method',
      description:
        'Creates or replaces one method, whole. Keyed on `key`, so saving again updates and the ' +
        'id stays put -- which matters because a design block points at a method by id. Does ' +
        'NOT publish it; that is a separate call.',
      inputSchema: {
        key: z.string().regex(/^[a-z][a-z0-9_]{1,48}$/u),
        moduleTypeKey: z
          .string()
          .regex(/^[a-z][a-z0-9_]{1,48}$/u)
          .describe('The block type this method becomes in an agenda, by key.'),
        defaultDurationMinutes: z.number().int().min(0).max(1440),
        groupSize: z
          .string()
          .optional()
          .describe('A Postgres range like "[8,21)" -- 8 to 20 people. Leave out for any size.'),
        facets: z.array(z.string()).optional(),
        text: Text,
      },
    },
    async (draft) =>
      guarded(async () => {
        requireOperatorScope(actor.scopes, 'catalog:author')
        const id = await saveCatalogMethod(db, actor.operatorId, draft)
        return ok(`Method "${draft.key}" saved.`, { id })
      }),
  )

  server.registerTool(
    'save_catalog_design',
    {
      title: 'Write a catalogue design',
      description:
        'Creates or replaces a design\u2019s own fields. Its days are set with ' +
        'set_catalog_days. Does not publish it.',
      inputSchema: {
        key: z.string().regex(/^[a-z][a-z0-9_]{1,48}$/u),
        durationMinutes: z
          .number()
          .int()
          .min(0)
          .max(43_200)
          .describe(
            'What the design is advertised at, including arrival, breaks and buffer -- not the ' +
              'sum of its blocks.',
          ),
        groupSize: z.string().optional(),
        facets: z.array(z.string()).optional(),
        text: Text,
      },
    },
    async (draft) =>
      guarded(async () => {
        requireOperatorScope(actor.scopes, 'catalog:author')
        const id = await saveCatalogDesign(db, actor.operatorId, draft)
        return ok(`Design "${draft.key}" saved.`, { id })
      }),
  )

  server.registerTool(
    'set_catalog_days',
    {
      title: 'Write a design\u2019s days',
      description:
        'Every day of a design, with its blocks, in one call -- the catalogue\u2019s ' +
        'apply_agenda. Replaces what is there. A module names its method BY KEY and the cluster ' +
        'it sits in by that cluster\u2019s ordinal on the same day. An unknown method key ' +
        'refuses the whole call and the design is left exactly as it was.',
      inputSchema: {
        designId: Id,
        days: z.array(
          z.object({
            ordinal: z.number().int().min(1).max(60),
            startMinute: z.number().int().min(0).max(1439).optional(),
            text: Text.optional(),
            blocks: z.array(
              z.object({
                ordinal: z.number().int().min(1),
                kind: z.enum(['cluster', 'module']),
                parentOrdinal: z.number().int().min(1).optional(),
                methodKey: z.string().optional(),
                durationMinutes: z.number().int().min(0).max(1440).optional(),
                pinnedStartMinute: z.number().int().min(0).max(1439).optional(),
                parked: z.boolean().optional(),
                color: z.string().optional(),
                text: Text.optional(),
              }),
            ),
          }),
        ),
      },
    },
    async ({ designId, days }) =>
      guarded(async () => {
        requireOperatorScope(actor.scopes, 'catalog:author')
        await setCatalogDays(db, actor.operatorId, designId, days)
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
      guarded(async () => {
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
      guarded(async () => {
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
        'A method publishes PER LANGUAGE, because each language is its own public address, and ' +
        'a language without a slug is refused -- that is what keeps a 404 out of the sitemap. A ' +
        'design publishes once, because it has no public address at all.',
      inputSchema: {
        kind: z.enum(['method', 'design']),
        id: Id,
        locales: z.array(z.enum(LOCALES)).optional(),
        published: z.boolean().default(true),
      },
    },
    async ({ kind, id, locales, published }) =>
      guarded(async () => {
        requireOperatorScope(actor.scopes, 'catalog:publish')
        await setCatalogStatus(db, actor.operatorId, kind, id, locales ?? [], published)
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
      guarded(async () => {
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
