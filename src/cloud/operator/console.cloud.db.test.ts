import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generateSecret, hashSecret } from '@/server/auth/tokens'
import { verifySessionCookie } from '@/server/auth/session'
import { withTenant } from '@/server/db'
import { edition } from '@/server/edition'
import {
  addPasskeyOptions,
  createOperatorSession,
  listPasskeys,
  peekEnrollment,
  peekSignInLink,
  removePasskey,
  requestSignInLink,
  revokeOperatorSession,
  signInOptions,
  spendSignInLink,
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
let operatorEmail: string

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
  operatorEmail = `operator-${randomUUID()}@example.test`
  const { rows } = await ops.query(
    `insert into operator (email, display_name) values ($1, 'Test Operator') returning id`,
    [operatorEmail],
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

describe('managing passkeys', () => {
  /**
   * An operator who signed in by mail has to be able to add a passkey without
   * a shell on the server -- otherwise the mail link is not a way back to the
   * passkey, it is a permanent replacement for one.
   */
  const credential = async (owner: string, id: string) => {
    await ops.query(
      `insert into operator_credential (operator_id, credential_id, public_key) values ($1, $2, 'k')`,
      [owner, id],
    )
  }

  it('offers a challenge bound to the operator, and excludes what is already registered', async () => {
    // Bound, because a challenge that is not tied to one operator is a
    // challenge that registers a passkey onto somebody else's account.
    const mine = `cred-${randomUUID()}`
    await credential(operatorId, mine)

    const options = await addPasskeyOptions(console_, operatorId)

    const { rows } = await ops.query(
      `select operator_id, purpose from operator_challenge where challenge = $1`,
      [options.challenge],
    )
    expect(rows[0]).toMatchObject({ operator_id: operatorId, purpose: 'registration' })
    // Otherwise the same authenticator registers twice and the list fills with
    // entries nobody can tell apart.
    expect(options.excludeCredentials?.map((c) => c.id)).toContain(mine)
  })

  it('lists what an operator has, and nothing of anybody else', async () => {
    const other = (
      await ops.query(
        `insert into operator (email, display_name) values ($1, 'Andere') returning id`,
        [`other-${randomUUID()}@example.test`],
      )
    ).rows[0].id
    const mine = `cred-${randomUUID()}`
    const theirs = `cred-${randomUUID()}`
    await credential(operatorId, mine)
    await credential(other, theirs)

    const listed = (await listPasskeys(console_, operatorId)).map((p) => p.credentialId)
    expect(listed).toContain(mine)
    expect(listed).not.toContain(theirs)

    // And removing is scoped the same way: holding a session is not holding
    // everybody's passkeys.
    expect(await removePasskey(console_, operatorId, theirs)).toBe(false)
    const { rowCount } = await ops.query(
      'select 1 from operator_credential where credential_id = $1',
      [theirs],
    )
    expect(rowCount).toBe(1)

    await ops.query('delete from operator_audit where operator_id = $1', [other])
    await ops.query('delete from operator where id = $1', [other])
  })

  it('removes a passkey of its own, and writes it to the audit log', async () => {
    const mine = `cred-${randomUUID()}`
    await credential(operatorId, mine)

    expect(await removePasskey(console_, operatorId, mine)).toBe(true)
    expect((await listPasskeys(console_, operatorId)).map((p) => p.credentialId)).not.toContain(
      mine,
    )

    const { rows } = await ops.query(
      `select action from operator_audit where operator_id = $1 order by at desc limit 1`,
      [operatorId],
    )
    expect(rows[0]?.action).toBe('passkey_removed')
  })
})

describe('signing in by mail', () => {
  const linkFor = async (email: string) => requestSignInLink(console_, email)

  it('issues a link for an operator, and the same silence for anybody else', async () => {
    // The answer must not say whether an address belongs to an operator: the
    // console has no public sign-up, so every address that gets a different
    // answer is one an attacker can rule in or out.
    const link = await linkFor(operatorEmail)
    expect(link).not.toBeNull()

    expect(await linkFor(`nobody-${randomUUID()}@example.test`)).toBeNull()
  })

  it('lets the link in once, and never again', async () => {
    const link = await linkFor(operatorEmail)
    expect(await spendSignInLink(console_, link!.token)).toMatchObject({ id: operatorId })
    expect(await spendSignInLink(console_, link!.token)).toBeNull()
  })

  it('survives being looked at, so a mail scanner cannot spend it', async () => {
    // Defender Safe Links fetches every URL in a Microsoft 365 mailbox before
    // delivery. When following the link spent it, the scanner went first and
    // the operator arrived to "already used" -- every time, for every new
    // link. Looking must therefore leave the link untouched.
    await ops.query('delete from operator_login where operator_id = $1', [operatorId])
    const link = await linkFor(operatorEmail)

    expect(await peekSignInLink(console_, link!.token)).toMatchObject({ id: operatorId })
    expect(await peekSignInLink(console_, link!.token)).toMatchObject({ id: operatorId })
    expect(await spendSignInLink(console_, link!.token)).toMatchObject({ id: operatorId })
  })

  it('shows nothing for a link that is spent, run out or unknown', async () => {
    // So the page says so at once, instead of offering a button that is
    // certain to fail.
    await ops.query('delete from operator_login where operator_id = $1', [operatorId])
    const spent = await linkFor(operatorEmail)
    await spendSignInLink(console_, spent!.token)
    expect(await peekSignInLink(console_, spent!.token)).toBeNull()

    const expired = await linkFor(operatorEmail)
    await ops.query(
      `update operator_login set expires_at = now() - interval '1 minute' where token_hash = $1`,
      [hashSecret(expired!.token)],
    )
    expect(await peekSignInLink(console_, expired!.token)).toBeNull()

    expect(await peekSignInLink(console_, generateSecret(32))).toBeNull()
  })

  it('refuses a link that has run out', async () => {
    const link = await linkFor(operatorEmail)
    await ops.query(
      `update operator_login set expires_at = now() - interval '1 minute' where token_hash = $1`,
      [hashSecret(link!.token)],
    )
    expect(await spendSignInLink(console_, link!.token)).toBeNull()
  })

  it('stops after three unspent links in an hour', async () => {
    await ops.query('delete from operator_login where operator_id = $1', [operatorId])
    for (let i = 0; i < 3; i += 1) expect(await linkFor(operatorEmail)).not.toBeNull()

    // Silently, and with the same answer an unknown address gets: a message
    // saying "too many" would be the answer the other address never gets.
    expect(await linkFor(operatorEmail)).toBeNull()
  })

  it('writes the sign-in to the audit log', async () => {
    await ops.query('delete from operator_login where operator_id = $1', [operatorId])
    const link = await linkFor(operatorEmail)
    await spendSignInLink(console_, link!.token)

    const { rows } = await ops.query(
      `select action from operator_audit where operator_id = $1 order by at desc limit 1`,
      [operatorId],
    )
    expect(rows[0]?.action).toBe('sign_in_mail')
  })

  it('refuses a disabled operator, link or no link', async () => {
    const link = await linkFor(operatorEmail)
    await ops.query('update operator set disabled_at = now() where id = $1', [operatorId])
    try {
      expect(await spendSignInLink(console_, link!.token)).toBeNull()
      expect(await linkFor(operatorEmail)).toBeNull()
    } finally {
      await ops.query('update operator set disabled_at = null where id = $1', [operatorId])
    }
  })
})
