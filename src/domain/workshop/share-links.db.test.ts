import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { withTenant, type Actor } from '@/server/db'
import { assertWorkshopAccess, NotFoundError } from '@/domain/agenda/access'
import { hashSecret } from '@/server/auth/tokens'
import { createShareLink, lastDayOf, listShareLinks, revokeShareLink } from './share-links'
import { ShareLinkError } from './share-rules'

/**
 * Guest invitations against a real database.
 *
 * Two things are being asserted, and the second is the reason this file is
 * mandatory rather than nice to have. The first is that an invitation behaves --
 * created, listed, re-issued, withdrawn. The second is TENANT ISOLATION: a new
 * table without a working policy is a silent, total data leak with no symptom,
 * and `workshop_share_link` now carries e-mail addresses of people outside the
 * organisation.
 */

const TENANT = randomUUID()
const OTHER_TENANT = randomUUID()
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

let ownerId: string
let otherOwnerId: string
let workshopId: string
let otherWorkshopId: string
const identities: string[] = []

const as = (tenantId: string, memberId: string): Actor => ({
  tenantId,
  memberId,
  tenantRole: 'member',
  source: 'web',
})

async function makeMember(tenantId: string): Promise<string> {
  const identityId = randomUUID()
  const memberId = randomUUID()
  identities.push(identityId)

  await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
    identityId,
    `s-${identityId}@example.test`,
    'active',
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
    [memberId, tenantId, identityId],
  )
  return memberId
}

async function makeWorkshop(tenantId: string, ownerId: string): Promise<string> {
  const id = uuidv7()
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Gastfreigabe', $3, 'a0')`,
    [id, tenantId, ownerId],
  )
  return id
}

/** The access token every domain call needs, resolved the way the app resolves it. */
async function accessTo(actor: Actor, id: string) {
  return withTenant(actor, (tx) => assertWorkshopAccess(tx, actor, id, 'workshop.share'))
}

beforeAll(async () => {
  await ops.connect()
  for (const [id, name] of [
    [TENANT, 'Gasttest'],
    [OTHER_TENANT, 'Fremd'],
  ] as const) {
    await ops.query('insert into tenant (id, slug, name) values ($1, $2, $3)', [
      id,
      `t-${id.slice(0, 8)}`,
      name,
    ])
  }

  ownerId = await makeMember(TENANT)
  otherOwnerId = await makeMember(OTHER_TENANT)
  workshopId = await makeWorkshop(TENANT, ownerId)
  otherWorkshopId = await makeWorkshop(OTHER_TENANT, otherOwnerId)
})

afterAll(async () => {
  for (const tenantId of [TENANT, OTHER_TENANT]) {
    await ops.query('delete from workshop where tenant_id = $1', [tenantId])
    await ops.query('delete from tenant where id = $1', [tenantId])
  }
  for (const id of identities) await ops.query('delete from identity where id = $1', [id])
  await ops.end()
})

beforeEach(async () => {
  await ops.query('delete from workshop_share_link where tenant_id = any($1)', [
    [TENANT, OTHER_TENANT],
  ])
  await ops.query('delete from workshop_day where tenant_id = $1', [TENANT])
})

describe('share links', () => {
  it('invites an address and lists it back', async () => {
    const actor = as(TENANT, ownerId)
    const access = await accessTo(actor, workshopId)

    await withTenant(actor, (tx) =>
      createShareLink(tx, access, '  Gast@Example.COM ', 'viewer', hashSecret('t1')),
    )

    const links = await withTenant(actor, (tx) => listShareLinks(tx, access))
    expect(links).toHaveLength(1)
    // Normalised on the way in, so the unique constraint and the gate's lookup
    // agree about what this address is.
    expect(links[0]!.email).toBe('gast@example.com')
    expect(links[0]!.role).toBe('viewer')
    expect(links[0]!.lastSeenAt).toBeNull()
  })

  it('re-inviting the same address replaces the token instead of adding a second link', async () => {
    const actor = as(TENANT, ownerId)
    const access = await accessTo(actor, workshopId)

    await withTenant(actor, (tx) =>
      createShareLink(tx, access, 'gast@example.com', 'viewer', hashSecret('first')),
    )
    await withTenant(actor, (tx) =>
      createShareLink(tx, access, 'gast@example.com', 'editor', hashSecret('second')),
    )

    const links = await withTenant(actor, (tx) => listShareLinks(tx, access))
    expect(links).toHaveLength(1)
    expect(links[0]!.role).toBe('editor')

    // The first mail stops working, which is what somebody re-sending an
    // invitation expects -- and the way back from a link sent to a typo.
    const { rows } = await ops.query('select token_hash from workshop_share_link where id = $1', [
      links[0]!.id,
    ])
    expect(rows[0].token_hash).toBe(hashSecret('second'))
  })

  it('withdrawing a link takes it off the list and refuses a second withdrawal', async () => {
    const actor = as(TENANT, ownerId)
    const access = await accessTo(actor, workshopId)

    const created = await withTenant(actor, (tx) =>
      createShareLink(tx, access, 'gast@example.com', 'viewer', hashSecret('t3')),
    )
    await withTenant(actor, (tx) => revokeShareLink(tx, access, created.id))

    expect(await withTenant(actor, (tx) => listShareLinks(tx, access))).toHaveLength(0)
    await expect(
      withTenant(actor, (tx) => revokeShareLink(tx, access, created.id)),
    ).rejects.toThrow('sharing.linkGone')
  })

  it('refuses a link id that belongs to another workshop', async () => {
    const actor = as(TENANT, ownerId)
    const access = await accessTo(actor, workshopId)
    const second = await makeWorkshop(TENANT, ownerId)
    const secondAccess = await accessTo(actor, second)

    const created = await withTenant(actor, (tx) =>
      createShareLink(tx, secondAccess, 'gast@example.com', 'viewer', hashSecret('t4')),
    )

    // The same tenant and the same member, so RLS permits the row -- the guard
    // that has to hold here is the workshop_id in the WHERE clause.
    await expect(
      withTenant(actor, (tx) => revokeShareLink(tx, access, created.id)),
    ).rejects.toThrow('sharing.linkGone')
  })

  it('rejects a malformed address before writing anything', async () => {
    const actor = as(TENANT, ownerId)
    const access = await accessTo(actor, workshopId)

    await expect(
      withTenant(actor, (tx) => createShareLink(tx, access, 'not-an-address', 'viewer', 'h')),
    ).rejects.toThrow(ShareLinkError)

    expect(await withTenant(actor, (tx) => listShareLinks(tx, access))).toHaveLength(0)
  })

  it('derives the deadline from the last dated day', async () => {
    const actor = as(TENANT, ownerId)
    const access = await accessTo(actor, workshopId)

    await withTenant(actor, (tx) =>
      createShareLink(tx, access, 'gast@example.com', 'viewer', hashSecret('t5')),
    )

    // Undated: nothing to expire on.
    expect(await withTenant(actor, (tx) => lastDayOf(tx, workshopId))).toBeNull()
    expect((await withTenant(actor, (tx) => listShareLinks(tx, access)))[0]!.expiresAt).toBeNull()

    // Two days, one of them undated: the dated one is the deadline.
    for (const [date, position] of [
      ['2026-09-20', 'a0'],
      [null, 'a1'],
    ] as const) {
      await ops.query(
        `insert into workshop_day (id, tenant_id, workshop_id, date, position) values ($1, $2, $3, $4, $5)`,
        [uuidv7(), TENANT, workshopId, date, position],
      )
    }

    expect(await withTenant(actor, (tx) => lastDayOf(tx, workshopId))).toBe('2026-09-20')
    const links = await withTenant(actor, (tx) => listShareLinks(tx, access))
    // The start of the day after, so the whole last day is covered.
    expect(links[0]!.expiresAt?.toISOString()).toBe('2026-09-21T00:00:00.000Z')
  })
})

/**
 * The most important test in this file.
 *
 * A table holding the addresses of people outside the organisation, with a
 * policy that does not work, leaks every one of them with no symptom at all.
 */
describe('tenant isolation', () => {
  it('hides another tenant’s invitations completely', async () => {
    const mine = as(TENANT, ownerId)
    const theirs = as(OTHER_TENANT, otherOwnerId)

    const myAccess = await accessTo(mine, workshopId)
    await withTenant(mine, (tx) =>
      createShareLink(tx, myAccess, 'gast@example.com', 'editor', hashSecret('mine')),
    )

    // Their own workshop: a real, working session in the other tenant.
    const theirAccess = await accessTo(theirs, otherWorkshopId)
    expect(await withTenant(theirs, (tx) => listShareLinks(tx, theirAccess))).toHaveLength(0)

    // And my workshop is not even visible to them, so there is no list to ask
    // for -- 404 rather than an empty result, which is the documented rule.
    await expect(accessTo(theirs, workshopId)).rejects.toThrow(NotFoundError)
  })

  it.each(['workshop_share_link', 'share_session'])(
    'refuses a write into %s that claims a foreign tenant',
    async (table) => {
      /**
       * The WITH CHECK half of the policy: RLS stops the reads above, this stops a
       * write from planting a row in somebody else's tenant.
       *
       * Asserted on the SQLSTATE rather than the message, for the reason
       * rls.db.test.ts gives: the ORM wraps the text, and a regex over a wrapped
       * message is the kind of assertion that keeps passing after it has stopped
       * meaning anything. 42501 is what Postgres raises for a WITH CHECK
       * violation.
       */
      const insert =
        table === 'workshop_share_link'
          ? sql`insert into workshop_share_link (id, tenant_id, workshop_id, email, token_hash)
                values (${randomUUID()}, ${OTHER_TENANT}, ${otherWorkshopId}, 'gast@example.com', ${hashSecret('x')})`
          : sql`insert into share_session (id, tenant_id, share_link_id, secret_hash, expires_at)
                values (${randomUUID()}, ${OTHER_TENANT}, ${randomUUID()}, ${hashSecret('y')}, now() + interval '1 day')`

      const error = await withTenant(as(TENANT, ownerId), (tx) => tx.execute(insert)).then(
        () => null,
        (e: unknown) => e as { cause?: { code?: string; message?: string } },
      )

      expect(error).not.toBeNull()
      expect(error?.cause?.code).toBe('42501')
      expect(error?.cause?.message).toMatch(/row-level security/i)
    },
  )

  it('keeps guest sessions inside their tenant too', async () => {
    const mine = as(TENANT, ownerId)
    const myAccess = await accessTo(mine, workshopId)
    const link = await withTenant(mine, (tx) =>
      createShareLink(tx, myAccess, 'gast@example.com', 'viewer', hashSecret('sess')),
    )

    const sessionId = randomUUID()
    await ops.query(
      `insert into share_session (id, tenant_id, share_link_id, secret_hash, expires_at)
       values ($1, $2, $3, $4, now() + interval '1 day')`,
      [sessionId, TENANT, link.id, hashSecret('s')],
    )

    // Read as the application role under each tenant, which is what a request
    // actually does -- gw_ops bypasses RLS and would see the row either way.
    const visibleTo = async (tenantId: string, memberId: string) => {
      const seen = await withTenant(as(tenantId, memberId), (tx) =>
        tx.execute(sql`select id from share_session where id = ${sessionId}`),
      )
      return seen.rows.length
    }

    expect(await visibleTo(TENANT, ownerId)).toBe(1)
    expect(await visibleTo(OTHER_TENANT, otherOwnerId)).toBe(0)

    // Withdrawing the invitation takes the session with it, through the
    // composite FK's ON DELETE CASCADE -- so a revoked link cannot leave a live
    // session behind even if a future caller forgets to check.
    await ops.query('delete from workshop_share_link where id = $1', [link.id])
    const { rows } = await ops.query('select id from share_session where id = $1', [sessionId])
    expect(rows).toHaveLength(0)
  })
})
