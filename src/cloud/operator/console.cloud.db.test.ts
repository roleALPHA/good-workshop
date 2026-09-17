import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hashSecret } from '@/server/auth/tokens'
import { verifySessionCookie } from '@/server/auth/session'
import { withTenant } from '@/server/db'
import { edition } from '@/server/edition'
import {
  createOperatorSession,
  peekEnrollment,
  revokeOperatorSession,
  signInOptions,
  verifyOperatorSession,
} from './auth'
import { applyOperatorAction, listTenants, tenantDetail } from './console'

/**
 * The operator console against a cloud database, as the role it runs as.
 *
 * The first describe is the one that matters most: gw_operator reaches figures
 * and actions through app.op_* and nothing else -- no workshop, no member, no
 * identity, even with a query written by hand.
 */

const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })
/** The same database the suite runs against, as the console's role. */
const operatorUrl =
  process.env.OPERATOR_DATABASE_URL ??
  (() => {
    const url = new URL(process.env.OPS_DATABASE_URL!)
    url.username = 'gw_operator'
    url.password = ''
    return url.toString()
  })()
const console_ = new pg.Pool({ connectionString: operatorUrl, max: 2 })
const tenants: string[] = []
const identities: string[] = []
let operatorId: string

async function workspace() {
  const tenantId = randomUUID()
  const identityId = randomUUID()
  const memberId = randomUUID()
  tenants.push(tenantId)
  identities.push(identityId)
  await ops.query(`insert into tenant (id, slug, name) values ($1, $2, 'Operatortest')`, [
    tenantId,
    `op-${tenantId.slice(0, 8)}`,
  ])
  await ops.query(`insert into identity (id, email) values ($1, $2)`, [
    identityId,
    `op-${identityId}@example.test`,
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'admin', 'active')`,
    [memberId, tenantId, identityId],
  )
  await ops.query(
    `insert into tenant_lifecycle (tenant_id, state, trial_ends_at) values ($1, 'active', '2026-01-01T00:00:00Z')`,
    [tenantId],
  )
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Geheimer Titel', $3, 'a0')`,
    [uuidv7(), tenantId, memberId],
  )
  return { tenantId, identityId, memberId }
}

beforeAll(async () => {
  await ops.connect()
  const { rows } = await ops.query(
    `insert into operator (email, display_name) values ($1, 'Test Operator') returning id`,
    [`operator-${randomUUID()}@example.test`],
  )
  operatorId = rows[0].id
})

afterAll(async () => {
  await ops.query('delete from operator_audit where operator_id = $1', [operatorId])
  await ops.query('delete from operator where id = $1', [operatorId])
  await ops.query('delete from tenant where id = any($1::uuid[])', [tenants])
  await ops.query('delete from identity where id = any($1::uuid[])', [identities])
  await console_.end()
  await ops.end()
})

describe('what the console role can reach', () => {
  it.each(['workshop', 'member', 'identity', 'module', 'auth_session', 'billing_account'])(
    'cannot read %s directly',
    async (table) => {
      await expect(console_.query(`select 1 from ${table} limit 1`)).rejects.toThrow(
        /permission denied/,
      )
    },
  )

  it('sees figures about a workspace, and never its content', async () => {
    const { tenantId } = await workspace()
    const found = (await listTenants(console_)).find((t) => t.id === tenantId)
    expect(found).toMatchObject({ name: 'Operatortest', members: 1, workshops: 1, state: 'active' })
    expect(JSON.stringify(await tenantDetail(console_, tenantId))).not.toContain('Geheimer Titel')
  })

  it('cannot write an audit entry that is not an append', async () => {
    await expect(console_.query(`update operator_audit set action = 'x'`)).rejects.toThrow()
    await expect(console_.query(`delete from operator_audit`)).rejects.toThrow()
  })
})

describe('operator actions', () => {
  it('pauses a workspace into read-only and back, and records who did it', async () => {
    const { tenantId, memberId } = await workspace()
    const actor = { tenantId, memberId, tenantRole: 'admin' as const, source: 'web' as const }

    await applyOperatorAction(console_, operatorId, tenantId, { kind: 'pause', reason: 'Prüfung' })
    expect(await withTenant(actor, (tx) => edition.tenantWritable(tx))).toBe(false)
    await applyOperatorAction(console_, operatorId, tenantId, {
      kind: 'unpause',
      reason: 'erledigt',
    })
    expect(await withTenant(actor, (tx) => edition.tenantWritable(tx))).toBe(true)

    const detail = await tenantDetail(console_, tenantId)
    expect(detail!.audit.map((entry) => entry.action)).toEqual(['unpause', 'pause'])
    expect(detail!.audit[1]).toMatchObject({
      operator: 'Test Operator',
      detail: { reason: 'Prüfung' },
    })
  })

  it('blocks a workspace so that its sessions stop working', async () => {
    const { tenantId, identityId } = await workspace()
    const sessionId = randomUUID()
    const secret = `s-${randomUUID()}`
    await ops.query(
      `insert into auth_session (id, identity_id, active_tenant_id, secret_hash, method, expires_at)
       values ($1, $2, $3, $4, 'passkey', now() + interval '1 day')`,
      [sessionId, identityId, tenantId, hashSecret(secret)],
    )
    expect(await verifySessionCookie(`${sessionId}.${secret}`)).not.toBeNull()

    await applyOperatorAction(console_, operatorId, tenantId, {
      kind: 'block',
      reason: 'Missbrauch',
    })
    expect(await verifySessionCookie(`${sessionId}.${secret}`)).toBeNull()
    await applyOperatorAction(console_, operatorId, tenantId, {
      kind: 'unblock',
      reason: 'geklärt',
    })
    expect(await verifySessionCookie(`${sessionId}.${secret}`)).not.toBeNull()
  })

  it('extends a trial that ran out, and schedules and cancels a deletion', async () => {
    const { tenantId } = await workspace()
    await ops.query(`update tenant_lifecycle set state = 'read_only' where tenant_id = $1`, [
      tenantId,
    ])
    await applyOperatorAction(console_, operatorId, tenantId, { kind: 'extend_trial', days: 7 })
    let found = (await listTenants(console_)).find((t) => t.id === tenantId)!
    expect(found.state).toBe('trial')
    expect(found.trialEndsAt!.getTime()).toBeGreaterThan(Date.now() + 6 * 86_400_000)

    await expect(
      applyOperatorAction(console_, operatorId, tenantId, { kind: 'extend_trial', days: 365 }),
    ).rejects.toThrow()

    await applyOperatorAction(console_, operatorId, tenantId, {
      kind: 'schedule_deletion',
      days: 0,
      reason: 'Kündigung',
    })
    found = (await listTenants(console_)).find((t) => t.id === tenantId)!
    expect(found.state).toBe('deleting')
    await applyOperatorAction(console_, operatorId, tenantId, { kind: 'cancel_deletion' })
    found = (await listTenants(console_)).find((t) => t.id === tenantId)!
    expect(found.state).toBe('trial')
  })

  it('releases a held period for billing, or drops it', async () => {
    const { tenantId } = await workspace()
    const period = randomUUID()
    await ops.query(
      `insert into billing_period (id, tenant_id, month, plan, quantity, unit_net_cents, net_cents, tax_kind,
         status, hold_reason, invoice_ref)
       values ($1, $2, '2026-08-01', 'per_user', 1, 100, 100, 'domestic', 'held', 'over_limit', $3)`,
      [period, tenantId, `GW-TEST-${period.slice(0, 8)}`],
    )
    await applyOperatorAction(console_, operatorId, tenantId, {
      kind: 'release_period',
      periodId: period,
      decision: 'bill',
    })
    const { rows } = await ops.query(
      'select status, hold_reason from billing_period where id = $1',
      [period],
    )
    expect(rows[0]).toEqual({ status: 'computed', hold_reason: null })
    await ops.query('delete from billing_period where id = $1', [period])
  })
})

describe('operator sign-in', () => {
  it('keeps a session for eight hours, ends it on idle or revocation, and not for a disabled operator', async () => {
    const session = await createOperatorSession(console_, operatorId, '127.0.0.1')
    expect(await verifyOperatorSession(console_, session.value)).toMatchObject({ id: operatorId })
    expect(await verifyOperatorSession(console_, `${session.value}x`)).toBeNull()

    const id = session.value.split('.')[0]
    await ops.query(
      `update operator_session set last_seen_at = now() - interval '31 minutes' where id = $1`,
      [id],
    )
    expect(await verifyOperatorSession(console_, session.value)).toBeNull()

    const second = await createOperatorSession(console_, operatorId, null)
    await revokeOperatorSession(console_, second.value)
    expect(await verifyOperatorSession(console_, second.value)).toBeNull()

    const third = await createOperatorSession(console_, operatorId, null)
    await ops.query('update operator set disabled_at = now() where id = $1', [operatorId])
    try {
      expect(await verifyOperatorSession(console_, third.value)).toBeNull()
    } finally {
      await ops.query('update operator set disabled_at = null where id = $1', [operatorId])
    }
  })

  it('accepts an enrollment link once it exists, and not after it expired', async () => {
    const token = `enroll-${randomUUID()}`
    await ops.query(
      `insert into operator_enrollment (operator_id, token_hash, expires_at) values ($1, $2, now() + interval '1 hour')`,
      [operatorId, hashSecret(token)],
    )
    expect(await peekEnrollment(console_, token)).toMatchObject({ id: operatorId })
    await ops.query(
      `update operator_enrollment set expires_at = now() - interval '1 minute' where token_hash = $1`,
      [hashSecret(token)],
    )
    expect(await peekEnrollment(console_, token)).toBeNull()
  })

  it('hands out challenges that are stored for verification', async () => {
    const options = await signInOptions(console_)
    const { rowCount } = await ops.query('select 1 from operator_challenge where challenge = $1', [
      options.challenge,
    ])
    expect(rowCount).toBe(1)
  })
})
