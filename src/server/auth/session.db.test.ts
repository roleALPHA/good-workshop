import { createHash, randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { verifySessionCookie } from './session'
import { activateMembership } from './magic-link'
import { authConfig } from './config'

/**
 * Session lifetime, and the id a session acts under.
 *
 * The cookie itself is built correctly -- httpOnly, SameSite, a hashed secret,
 * a constant-time comparison, revocation and membership re-read on every
 * request. What is missing is time: thirty days, no rotation, no idle window,
 * and a `last_seen_at` column that is written on every request and read by
 * nothing.
 */

const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })
const TENANT = authConfig.defaultTenantId

// Two people, because the two things under test need opposite fixtures: a
// session may only be verified for an ACTIVE member, while activateMembership
// has nothing to do unless the member is still 'invited'.
const identityId = randomUUID()
const memberId = randomUUID()

const invitedIdentityId = randomUUID()
const invitedMemberId = randomUUID()

async function makeSession(lastSeenAgo: string) {
  const sessionId = randomUUID()
  const secret = randomBytes(32).toString('base64url')
  await ops.query(
    `insert into auth_session (id, identity_id, active_tenant_id, secret_hash, method, expires_at, last_seen_at)
     values ($1, $2, $3, $4, 'magic_link', now() + interval '30 days', now() - $5::interval)`,
    [sessionId, identityId, TENANT, createHash('sha256').update(secret).digest('hex'), lastSeenAgo],
  )
  return `${sessionId}.${secret}`
}

beforeAll(async () => {
  await ops.connect()
  await ops.query(
    `insert into tenant (id, slug, name) values ($1, 'default', 'Test') on conflict (id) do nothing`,
    [TENANT],
  )
  for (const [id, suffix] of [
    [identityId, 'active'],
    [invitedIdentityId, 'invited'],
  ]) {
    await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
      id,
      `session-${suffix}-${id}@example.test`,
      'active',
    ])
  }
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status)
     values ($1, $2, $3, 'member', 'active')`,
    [memberId, TENANT, identityId],
  )
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status)
     values ($1, $2, $3, 'member', 'invited')`,
    [invitedMemberId, TENANT, invitedIdentityId],
  )
})

afterAll(async () => {
  await ops.query('delete from identity where id = any($1::uuid[])', [
    [identityId, invitedIdentityId],
  ])
  await ops.end()
})

describe('session lifetime', () => {
  it('accepts a session that was used recently', async () => {
    const cookie = await makeSession('1 hour')
    expect(await verifySessionCookie(cookie)).not.toBeNull()
  })

  it('refuses a session that has been idle too long', async () => {
    // Thirty days of absolute lifetime with no idle window means a cookie
    // copied off a shared machine keeps working for a month after the person
    // walked away from it.
    const cookie = await makeSession('20 days')
    expect(await verifySessionCookie(cookie)).toBeNull()
  })

  it('extends the window by being used', async () => {
    // An idle timeout that also logs out an active user is a broken feature,
    // not a strict one.
    const cookie = await makeSession('1 hour')
    await verifySessionCookie(cookie)

    const sessionId = cookie.split('.')[0]
    const { rows } = await ops.query(
      `select now() - last_seen_at < interval '1 minute' as fresh from auth_session where id = $1`,
      [sessionId],
    )
    expect(rows[0].fresh).toBe(true)
  })
})

describe('activateMembership', () => {
  it('acts under the member’s id, not the identity’s', async () => {
    // `withTenant({ memberId: identityId, ... })` puts an identity UUID into
    // app.member_id. No policy reads app.current_member() yet, so nothing is
    // wrong today -- but the function exists, and the first policy built on it
    // would be comparing against the wrong column with no error to show for it.
    const activated = await activateMembership(invitedIdentityId, TENANT)

    expect(activated).toBe(invitedMemberId)
    expect(activated).not.toBe(invitedIdentityId)
  })
})
