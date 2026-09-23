import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { fail, guarded, ok } from '@/server/mcp/respond'
import { applyOperatorAction, listTenants, listMaintenance, tenantDetail } from './console'
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
