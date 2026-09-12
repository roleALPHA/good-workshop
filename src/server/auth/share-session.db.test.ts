import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { guestActor, verifyGuestCookie } from './share-session'
import { generateSecret, hashSecret } from './tokens'

/**
 * The guest credential, against a real database.
 *
 * `verifyGuestCookie` is the whole gate: every guest page and the collaboration
 * socket ask it, and nothing else grants a guest anything. So what is asserted
 * here is mostly the list of ways it has to say NO -- a withdrawn invitation, a
 * stale session, a workshop whose last day has passed, a tampered cookie.
 *
 * `createGuestSession` cannot be called from here: it writes a cookie through
 * next/headers and there is no request. The rows it would write are inserted
 * directly instead, which is also what makes each refusal testable in isolation.
 */

const TENANT = randomUUID()
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

let ownerId: string
let workshopId: string
let dayId: string
let linkId: string
let identityId: string

/** A cookie for a session, in the shape the browser would send back. */
const cookie = (sessionId: string, secret: string, tenantId = TENANT) =>
  `${tenantId}.${sessionId}.${secret}`

async function makeLink(
  role: 'viewer' | 'editor' = 'viewer',
  email = 'gast@example.test',
): Promise<string> {
  const id = randomUUID()
  await ops.query(
    `insert into workshop_share_link (id, tenant_id, workshop_id, email, token_hash, role)
     values ($1, $2, $3, $4, $5, $6)`,
    [id, TENANT, workshopId, email, hashSecret(`tok-${id}`), role],
  )
  return id
}

/**
 * A live session for a link. The tests that need a stale or revoked one UPDATE it
 * afterwards -- clearer than a helper with five ways to be broken.
 */
async function makeSession(shareLinkId: string): Promise<{ id: string; secret: string }> {
  const id = randomUUID()
  const secret = generateSecret(32)
  await ops.query(
    `insert into share_session (id, tenant_id, share_link_id, secret_hash, expires_at)
     values ($1, $2, $3, $4, now() + interval '30 days')`,
    [id, TENANT, shareLinkId, hashSecret(secret)],
  )
  return { id, secret }
}

beforeAll(async () => {
  await ops.connect()
  await ops.query('insert into tenant (id, slug, name) values ($1, $2, $3)', [
    TENANT,
    `t-${TENANT.slice(0, 8)}`,
    'Gastsitzung',
  ])

  identityId = randomUUID()
  ownerId = randomUUID()
  await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
    identityId,
    `o-${identityId}@example.test`,
    'active',
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
    [ownerId, TENANT, identityId],
  )

  workshopId = uuidv7()
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Gastsitzung', $3, 'a0')`,
    [workshopId, TENANT, ownerId],
  )
  dayId = uuidv7()
  await ops.query(
    `insert into workshop_day (id, tenant_id, workshop_id, position) values ($1, $2, $3, 'a0')`,
    [dayId, TENANT, workshopId],
  )
})

afterAll(async () => {
  await ops.query('delete from workshop where tenant_id = $1', [TENANT])
  await ops.query('delete from tenant where id = $1', [TENANT])
  await ops.query('delete from identity where id = $1', [identityId])
  await ops.end()
})

beforeEach(async () => {
  await ops.query('delete from workshop_share_link where tenant_id = $1', [TENANT])
  await ops.query('update workshop_day set date = null where tenant_id = $1', [TENANT])
  linkId = await makeLink()
})

describe('verifyGuestCookie', () => {
  it('resolves a valid cookie into the grant the link carries', async () => {
    const editorLink = await makeLink('editor', 'writer@example.test')
    const session = await makeSession(editorLink)

    const guest = await verifyGuestCookie(cookie(session.id, session.secret))

    expect(guest).not.toBeNull()
    expect(guest).toMatchObject({
      linkId: editorLink,
      tenantId: TENANT,
      workshopId,
      email: 'writer@example.test',
      role: 'editor',
    })
  })

  it('refuses a wrong secret for a real session', async () => {
    const session = await makeSession(linkId)
    expect(await verifyGuestCookie(cookie(session.id, generateSecret(32)))).toBeNull()
  })

  it('refuses a cookie naming the wrong tenant', async () => {
    // The tenant in the cookie is not a credential -- but it decides which
    // policy the lookup runs under, so a tampered one must find nothing rather
    // than reach another tenant's rows.
    const session = await makeSession(linkId)
    expect(await verifyGuestCookie(cookie(session.id, session.secret, randomUUID()))).toBeNull()
  })

  it.each([
    ['no separators at all', 'garbage'],
    ['only one separator', `${TENANT}.something`],
    ['a non-uuid session id', `${TENANT}.not-a-uuid.secret`],
    ['a non-uuid tenant', `nope.${randomUUID()}.secret`],
    ['an empty secret', `${TENANT}.${randomUUID()}.`],
    // SQL injection through the cookie: it reaches a uuid comparison, which is
    // why the shape is checked before the query rather than after it.
    ['a session id that is an injection attempt', `${TENANT}.' or 1=1 --.secret`],
  ])('refuses a malformed cookie: %s', async (_name, raw) => {
    expect(await verifyGuestCookie(raw)).toBeNull()
  })

  it('stops working the moment the invitation is withdrawn', async () => {
    const session = await makeSession(linkId)
    expect(await verifyGuestCookie(cookie(session.id, session.secret))).not.toBeNull()

    await ops.query('update workshop_share_link set revoked_at = now() where id = $1', [linkId])

    // Not at the next login, not when the cookie expires: now. That is the
    // reason the link is re-read on every request.
    expect(await verifyGuestCookie(cookie(session.id, session.secret))).toBeNull()
  })

  it('picks up a role change without a new session', async () => {
    const session = await makeSession(linkId)
    expect((await verifyGuestCookie(cookie(session.id, session.secret)))?.role).toBe('viewer')

    await ops.query(`update workshop_share_link set role = 'editor' where id = $1`, [linkId])
    expect((await verifyGuestCookie(cookie(session.id, session.secret)))?.role).toBe('editor')

    // And back down, which is the direction that matters: a guest demoted to
    // reading must not keep a write socket's worth of permission.
    await ops.query(`update workshop_share_link set role = 'viewer' where id = $1`, [linkId])
    expect((await verifyGuestCookie(cookie(session.id, session.secret)))?.role).toBe('viewer')
  })

  it('refuses a revoked session', async () => {
    const session = await makeSession(linkId)
    await ops.query('update share_session set revoked_at = now() where id = $1', [session.id])
    expect(await verifyGuestCookie(cookie(session.id, session.secret))).toBeNull()
  })

  it('refuses an expired session and one that has gone idle', async () => {
    const expired = await makeSession(linkId)
    await ops.query(
      `update share_session set expires_at = now() - interval '1 day' where id = $1`,
      [expired.id],
    )
    expect(await verifyGuestCookie(cookie(expired.id, expired.secret))).toBeNull()

    // The idle window, independent of the absolute lifetime: a cookie left on a
    // borrowed machine stops working long before the session would.
    const idle = await makeSession(linkId)
    await ops.query(
      `update share_session set last_seen_at = now() - interval '60 days' where id = $1`,
      [idle.id],
    )
    expect(await verifyGuestCookie(cookie(idle.id, idle.secret))).toBeNull()
  })

  it('refuses once the agenda’s last day has passed, and works again when it moves', async () => {
    const session = await makeSession(linkId)

    await ops.query('update workshop_day set date = $1 where id = $2', ['2020-01-01', dayId])
    expect(await verifyGuestCookie(cookie(session.id, session.secret))).toBeNull()

    // The deadline is derived, not stored -- so rescheduling the workshop brings
    // the invitation back rather than leaving the guest locked out of a workshop
    // that has not happened yet.
    await ops.query('update workshop_day set date = $1 where id = $2', ['2099-01-01', dayId])
    expect(await verifyGuestCookie(cookie(session.id, session.secret))).not.toBeNull()

    // Undated is not expired either.
    await ops.query('update workshop_day set date = null where id = $1', [dayId])
    expect(await verifyGuestCookie(cookie(session.id, session.secret))).not.toBeNull()
  })

  it('touches last_seen_at so the idle window is measured from real use', async () => {
    const session = await makeSession(linkId)
    await ops.query(
      `update share_session set last_seen_at = now() - interval '2 days' where id = $1`,
      [session.id],
    )

    await verifyGuestCookie(cookie(session.id, session.secret))

    const { rows } = await ops.query(
      `select last_seen_at > now() - interval '1 minute' as fresh from share_session where id = $1`,
      [session.id],
    )
    expect(rows[0].fresh).toBe(true)
  })
})

describe('guestActor', () => {
  it('is not a member and carries only the grant', async () => {
    const session = await makeSession(linkId)
    const guest = await verifyGuestCookie(cookie(session.id, session.secret))
    const actor = guestActor(guest!)

    // The three properties every downstream check depends on.
    expect(actor.memberId).toBeNull()
    expect(actor.tenantRole).toBe('member')
    expect(actor.share).toEqual({ linkId, workshopId, role: 'viewer' })
  })
})
