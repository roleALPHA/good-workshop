import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { hashSecret } from '@/server/auth/tokens'
import { verifySessionCookie } from '@/server/auth/session'
import { completeSignup, peekSignup, requestSignup } from './signup'
import { parseSignup } from './rules'

/**
 * Registering, against a cloud database: what one confirmed link creates, and
 * that it creates it exactly once.
 */

const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })
const emails: string[] = []

const address = () => {
  const email = `signup-${randomUUID()}@example.test`
  emails.push(email)
  return email
}

const signup = (email: string, overrides: Record<string, unknown> = {}) =>
  parseSignup({
    customerType: 'business',
    firstName: 'Rita',
    lastName: 'Register',
    email,
    companyName: 'Register GmbH',
    street: 'Ring 1',
    postalCode: '1010',
    city: 'Wien',
    country: 'AT',
    vatId: 'ATU12345678',
    plan: 'per_workshop',
    acceptedTerms: true,
    acceptedDpa: true,
    ...overrides,
  })

/** A pending registration with a token the test knows. */
async function pending(email: string, expiresIn = '1 hour', overrides = {}) {
  const token = `tok-${randomUUID()}`
  await ops.query(
    `insert into pending_signup (id, token_hash, email, payload, expires_at)
     values ($1, $2, $3, $4, now() + $5::interval)`,
    [
      randomUUID(),
      hashSecret(token),
      email,
      { ...signup(email, overrides), locale: 'de', trialDays: 14 },
      expiresIn,
    ],
  )
  return token
}

beforeAll(async () => {
  await ops.connect()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

afterAll(async () => {
  const { rows } = await ops.query(
    `select m.tenant_id from member m join identity i on i.id = m.identity_id where i.email = any($1)`,
    [emails],
  )
  await ops.query('delete from tenant where id = any($1::uuid[])', [rows.map((r) => r.tenant_id)])
  await ops.query('delete from billing_account where tenant_id = any($1::uuid[])', [
    rows.map((r) => r.tenant_id),
  ])
  await ops.query('delete from identity where email = any($1)', [emails])
  await ops.query('delete from pending_signup where email = any($1)', [emails])
  await ops.end()
})

describe('completing a registration', () => {
  it('creates the workspace, its admin, the trial and the billing account', async () => {
    const email = address()
    const token = await pending(email)
    expect(await peekSignup(token)).toBe(true)

    const done = await completeSignup(token)
    expect(done.outcome).toBe('created')
    if (done.outcome !== 'created') return

    const { rows: members } = await ops.query(
      `select m.role, m.status, m.first_name, m.last_name, i.email_verified_at, t.name
         from member m join identity i on i.id = m.identity_id join tenant t on t.id = m.tenant_id
        where m.tenant_id = $1`,
      [done.tenantId],
    )
    expect(members).toHaveLength(1)
    expect(members[0]).toMatchObject({
      role: 'admin',
      status: 'active',
      first_name: 'Rita',
      last_name: 'Register',
      name: 'Register GmbH',
    })
    expect(members[0].email_verified_at).not.toBeNull()

    const { rows: lifecycle } = await ops.query(
      `select state, extract(day from trial_ends_at - now())::int as days from tenant_lifecycle where tenant_id = $1`,
      [done.tenantId],
    )
    expect(lifecycle[0].state).toBe('trial')
    expect(lifecycle[0].days).toBeGreaterThanOrEqual(13)

    const { rows: billing } = await ops.query(
      `select customer_type, company_name, country, vat_id, plan, billing_email,
              terms_accepted_at is not null as terms, dpa_accepted_at is not null as dpa,
              early_start_requested_at is null as no_early_start
         from billing_account where tenant_id = $1`,
      [done.tenantId],
    )
    expect(billing[0]).toMatchObject({
      customer_type: 'business',
      company_name: 'Register GmbH',
      country: 'AT',
      vat_id: 'ATU12345678',
      plan: 'per_workshop',
      billing_email: email,
      terms: true,
      dpa: true,
      no_early_start: true,
    })

    const { rows: types } = await ops.query(
      'select count(*)::int as n from module_type where tenant_id = $1',
      [done.tenantId],
    )
    expect(types[0].n).toBeGreaterThan(5)

    // The link is spent.
    expect(await peekSignup(token)).toBe(false)
    expect((await completeSignup(token)).outcome).toBe('invalid')
  })

  it('records a consumer’s request to start before the withdrawal period ends', async () => {
    const email = address()
    const token = await pending(email, '1 hour', {
      customerType: 'consumer',
      companyName: '',
      vatId: '',
      acceptedDpa: false,
      requestedEarlyStart: true,
    })
    const done = await completeSignup(token)
    if (done.outcome !== 'created') throw new Error(done.outcome)
    const { rows } = await ops.query(
      `select customer_type, dpa_accepted_at, early_start_requested_at is not null as early, t.name
         from billing_account b join tenant t on t.id = b.tenant_id where b.tenant_id = $1`,
      [done.tenantId],
    )
    expect(rows[0]).toMatchObject({
      customer_type: 'consumer',
      dpa_accepted_at: null,
      early: true,
      name: 'Rita Register',
    })
  })

  it('creates exactly one workspace when the link is clicked twice at once', async () => {
    const email = address()
    const token = await pending(email)
    const results = await Promise.all([completeSignup(token), completeSignup(token)])
    expect(results.map((r) => r.outcome).sort()).toEqual(['created', 'invalid'])
  })

  it('refuses an expired link', async () => {
    const email = address()
    const token = await pending(email, '-1 minute')
    expect(await peekSignup(token)).toBe(false)
    expect((await completeSignup(token)).outcome).toBe('invalid')
  })

  it('creates nothing for an address that already has a workspace', async () => {
    const email = address()
    const first = await completeSignup(await pending(email))
    expect(first.outcome).toBe('created')

    expect((await completeSignup(await pending(email))).outcome).toBe('exists')
    const { rows } = await ops.query(
      `select count(*)::int as n from member m join identity i on i.id = m.identity_id where i.email = $1`,
      [email],
    )
    expect(rows[0].n).toBe(1)
  })

  it('signs the new admin in', async () => {
    const email = address()
    const done = await completeSignup(await pending(email))
    if (done.outcome !== 'created') throw new Error(done.outcome)
    const sessionId = randomUUID()
    const secret = `s-${randomUUID()}`
    await ops.query(
      `insert into auth_session (id, identity_id, active_tenant_id, secret_hash, method, expires_at)
       values ($1, $2, $3, $4, 'magic_link', now() + interval '1 day')`,
      [sessionId, done.identityId, done.tenantId, hashSecret(secret)],
    )
    expect(await verifySessionCookie(`${sessionId}.${secret}`)).toMatchObject({
      tenantId: done.tenantId,
      tenantRole: 'admin',
      displayName: 'Rita Register',
    })
  })
})

describe('asking for a registration link', () => {
  it('mails a confirmation to a new address and an "already registered" note to a known one', async () => {
    vi.stubEnv('GW_MAIL_TRANSPORT', 'console')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    const fresh = address()
    await requestSignup(signup(fresh), 'de')
    expect(log.mock.calls.flat().join('\n')).toContain('/registrieren/bestaetigen?token=')

    const known = address()
    await completeSignup(await pending(known))
    log.mockClear()
    await requestSignup(signup(known), 'de')
    const sent = log.mock.calls.flat().join('\n')
    expect(sent).not.toContain('/registrieren/bestaetigen?token=')
    expect(sent).toContain('/login')
  })

  it('stops mailing an address after three requests in an hour', async () => {
    vi.stubEnv('GW_MAIL_TRANSPORT', 'console')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const email = address()
    for (let i = 0; i < 5; i++) await requestSignup(signup(email), 'de')
    const mails = log.mock.calls.flat().filter((line) => String(line).includes(`To:      ${email}`))
    expect(mails).toHaveLength(3)
  })
})
