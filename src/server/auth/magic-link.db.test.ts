import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { consumeMagicLink, issueMagicLink, peekMagicLink } from './magic-link'
import { authConfig } from './config'

/**
 * The e-mail token path, against a real database.
 *
 * This is a full authentication route, not a fallback: an on-prem install
 * without TLS has no passkeys at all, so every property here is load-bearing.
 */

const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })
const email = `magic-${randomUUID()}@example.test`
const identityId = randomUUID()

// The throttling test deliberately exhausts an address's window. It gets its
// own so it cannot decide the outcome of whatever runs next -- a test that
// leaves the fixture spent is a test that breaks its neighbours.
const burstEmail = `burst-${randomUUID()}@example.test`
const burstIdentityId = randomUUID()

// The same reason: looking at links issues a few more of them, and five per
// address is the whole window.
const peekEmail = `peek-${randomUUID()}@example.test`
const peekIdentityId = randomUUID()

beforeAll(async () => {
  await ops.connect()
  await ops.query(
    `insert into tenant (id, slug, name) values ($1, $2, 'Test') on conflict (id) do nothing`,
    [authConfig.defaultTenantId, 'default'],
  )
  for (const [id, address] of [
    [identityId, email],
    [burstIdentityId, burstEmail],
    [peekIdentityId, peekEmail],
  ]) {
    await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
      id,
      address,
      'active',
    ])
    await ops.query(
      `insert into member (id, tenant_id, identity_id, role, status)
       values ($1, $2, $3, 'member', 'invited')`,
      [randomUUID(), authConfig.defaultTenantId, id],
    )
  }
})

afterAll(async () => {
  await ops.query('delete from identity where id = any($1::uuid[])', [
    [identityId, burstIdentityId, peekIdentityId],
  ])
  await ops.end()
})

const tokenOf = (link: string) => new URL(link).searchParams.get('token')!

describe('magic links', () => {
  it('issues a link for a known address', async () => {
    const issued = await issueMagicLink(email)
    expect(issued?.email).toBe(email)
    expect(tokenOf(issued!.link)).toHaveLength(43)
  })

  it('says nothing about unknown addresses', async () => {
    // Not an error, not a different message: an anonymous visitor must not be
    // able to use this endpoint to find out which addresses have accounts.
    expect(await issueMagicLink(`nobody-${randomUUID()}@example.test`)).toBeNull()
  })

  it('rejects something that is not an address before touching the database', async () => {
    expect(await issueMagicLink('kein-at-zeichen')).toBeNull()
  })

  it('can be consumed exactly once', async () => {
    const issued = await issueMagicLink(email)
    const token = tokenOf(issued!.link)

    const first = await consumeMagicLink(token)
    expect(first?.identityId).toBe(identityId)

    // The single-use property comes from UPDATE ... WHERE consumed_at IS NULL,
    // so two concurrent requests race in the database and exactly one wins.
    expect(await consumeMagicLink(token)).toBeNull()
  })

  it('can be looked at any number of times without spending it', async () => {
    // What /verify does on GET. Microsoft Defender's Safe Links, iOS link
    // previews and every other scanner open the link before the person does;
    // when that GET consumed the token, the person only ever saw "expired".
    const issued = await issueMagicLink(peekEmail)
    const token = tokenOf(issued!.link)

    expect(await peekMagicLink(token)).toBe(true)
    expect(await peekMagicLink(token)).toBe(true)
    expect((await consumeMagicLink(token))?.identityId).toBe(peekIdentityId)
  })

  it('reports a spent token as unusable when looked at', async () => {
    const issued = await issueMagicLink(peekEmail)
    const token = tokenOf(issued!.link)
    await consumeMagicLink(token)

    expect(await peekMagicLink(token)).toBe(false)
    expect(await peekMagicLink('vollstaendig-erfunden')).toBe(false)
  })

  it('refuses a token that has expired', async () => {
    const issued = await issueMagicLink(email)
    const token = tokenOf(issued!.link)
    await ops.query(`update email_token set expires_at = now() - interval '1 minute'`)
    expect(await peekMagicLink(token)).toBe(false)
    expect(await consumeMagicLink(token)).toBeNull()
  })

  it('refuses a token that was never issued', async () => {
    expect(await consumeMagicLink('vollstaendig-erfunden')).toBeNull()
  })

  it('refuses a token that was not issued for logging in', async () => {
    // `purpose` is selected in the RETURNING clause and then never looked at.
    // Today that is harmless, because 'login' is the only value anything
    // writes. The check constraint already allows 'invite' and 'email_change',
    // and the day somebody adds an address-change flow, its token becomes a
    // login token for the account it was meant to re-verify.
    const issued = await issueMagicLink(email)
    const token = tokenOf(issued!.link)
    await ops.query(`update email_token set purpose = 'email_change' where consumed_at is null`)

    expect(await consumeMagicLink(token)).toBeNull()
  })

  it('stops issuing links long before an inbox is buried', async () => {
    // Anonymous, unauthenticated, one database row and one outbound mail per
    // call. Through the operator's own relay, which is what makes it their
    // reputation problem rather than only their disk.
    const results = []
    for (let i = 0; i < 12; i++) results.push(await issueMagicLink(burstEmail))

    expect(results.filter(Boolean).length).toBeLessThan(12)
  })

  it('holds the limit when the requests arrive at the same moment', async () => {
    // Counting and inserting are two statements. Without something that makes
    // the second request wait for the first, twelve requests fired together all
    // count the same "fewer than five" and every one of them sends a mail. The
    // per-address limit then only ever held for somebody polite enough to wait.
    const address = `race-${randomUUID()}@example.test`
    const id = randomUUID()
    await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
      id,
      address,
      'active',
    ])

    try {
      const results = await Promise.all(Array.from({ length: 12 }, () => issueMagicLink(address)))
      expect(results.filter(Boolean)).toHaveLength(5)
    } finally {
      await ops.query('delete from identity where id = $1', [id])
    }
  })

  it('stores only a hash, so a stolen dump yields no working links', async () => {
    const issued = await issueMagicLink(email)
    const token = tokenOf(issued!.link)
    const { rows } = await ops.query(
      'select token_hash from email_token order by created_at desc limit 1',
    )
    expect(rows[0].token_hash).not.toBe(token)
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/)
  })
})
