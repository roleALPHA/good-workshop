import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withTenant, type Actor } from '@/server/db'
import { NotFoundError, assertWorkshopAccess } from '@/domain/agenda/access'
import { listTags, listWorkshops } from './repo'
import { pruneUnusedTags, setWorkshopTags, tagsOf } from './tags'

/**
 * The library query against a real database.
 *
 * Visibility now lives in TWO places: the predicate this query filters with,
 * and `assertWorkshopAccess` on the page you land on. They have to agree --
 * a row that appears in the list and then 404s is a worse bug than either half
 * getting it wrong alone, so the first test asserts them against each other.
 */

const TENANT = randomUUID()
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

let ownerId: string
let colleagueId: string
let adminId: string
const identities: string[] = []
const made: string[] = []

const as = (memberId: string, tenantRole: 'member' | 'admin' = 'member'): Actor => ({
  tenantId: TENANT,
  memberId,
  tenantRole,
  source: 'web',
})

async function makeMember(role: 'member' | 'admin' = 'member'): Promise<string> {
  const identityId = randomUUID()
  const memberId = randomUUID()
  identities.push(identityId)

  await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
    identityId,
    `l-${identityId}@example.test`,
    'active',
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, $4, 'active')`,
    [memberId, TENANT, identityId, role],
  )
  return memberId
}

async function makeWorkshop(title: string, owner: string, offsetMinutes = 0): Promise<string> {
  const id = uuidv7()
  made.push(id)
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position, updated_at)
     values ($1, $2, $3, $4, 'a0', now() - ($5 || ' minutes')::interval)`,
    [id, TENANT, title, owner, String(offsetMinutes)],
  )
  return id
}

beforeAll(async () => {
  await ops.connect()
  await ops.query('insert into tenant (id, slug, name) values ($1, $2, $3)', [
    TENANT,
    `t-${TENANT.slice(0, 8)}`,
    'Bibliothekstest',
  ])

  ownerId = await makeMember()
  colleagueId = await makeMember()
  adminId = await makeMember('admin')
})

afterAll(async () => {
  await ops.query('delete from workshop where tenant_id = $1', [TENANT])
  await ops.query('delete from tenant where id = $1', [TENANT])
  for (const id of identities) await ops.query('delete from identity where id = $1', [id])
  await ops.end()
})

const list = (actor: Actor, options: Parameters<typeof listWorkshops>[2] = {}) =>
  withTenant(actor, (tx) => listWorkshops(tx, actor, options))

describe('what the list offers', () => {
  it('agrees with what opening a workshop allows', async () => {
    const mine = await makeWorkshop('Meiner', ownerId)
    const theirs = await makeWorkshop('Fremder', colleagueId)

    const page = await list(as(ownerId))
    const ids = page.workshops.map((row) => row.id)
    expect(ids).toContain(mine)
    expect(ids).not.toContain(theirs)

    // The other half of the same rule, from the code the page actually runs.
    await expect(
      withTenant(as(ownerId), (tx) =>
        assertWorkshopAccess(tx, as(ownerId), theirs, 'workshop.read'),
      ),
    ).rejects.toThrow(NotFoundError)
  })

  it('includes a workshop somebody shared', async () => {
    const shared = await makeWorkshop('Geteilt', ownerId)
    await ops.query(
      `insert into workshop_collaborator (tenant_id, workshop_id, member_id, role)
       values ($1, $2, $3, 'viewer')`,
      [TENANT, shared, colleagueId],
    )

    const page = await list(as(colleagueId))
    expect(page.workshops.find((row) => row.id === shared)?.role).toBe('viewer')
  })

  it('shows a tenant admin everything', async () => {
    const page = await list(as(adminId, 'admin'))
    expect(page.workshops.length).toBeGreaterThanOrEqual(made.length)
  })

  it('leaves out what was thrown away', async () => {
    const trashed = await makeWorkshop('Papierkorb', ownerId)
    await ops.query('update workshop set deleted_at = now() where id = $1', [trashed])

    const page = await list(as(ownerId))
    expect(page.workshops.map((row) => row.id)).not.toContain(trashed)
  })
})

describe('paging', () => {
  it('walks the whole list without repeating or skipping a row', async () => {
    for (let i = 0; i < 7; i++) await makeWorkshop(`Seite ${i}`, ownerId, i)

    const seen: string[] = []
    let cursor: string | null | undefined
    for (let page = 0; page < 10; page++) {
      const result = await list(as(ownerId), { limit: 3, cursor: cursor ?? undefined })
      seen.push(...result.workshops.map((row) => row.id))
      cursor = result.nextCursor
      if (!cursor) break
    }

    expect(cursor).toBeFalsy()
    expect(new Set(seen).size).toBe(seen.length)

    const everything = await list(as(ownerId), { limit: 100 })
    expect(seen.sort()).toEqual(everything.workshops.map((row) => row.id).sort())
  })

  it('starts from the top when the cursor is nonsense', async () => {
    // Opaque to the client, so a mangled one is a bad link rather than a
    // request worth failing.
    const page = await list(as(ownerId), { limit: 3, cursor: 'völliger unsinn' })
    expect(page.workshops.length).toBe(3)
  })
})

describe('search', () => {
  it('matches part of a title', async () => {
    await makeWorkshop('Strategie-Retreat Nordwind', ownerId)
    const page = await list(as(ownerId), { search: 'strat' })
    expect(page.workshops.map((row) => row.title)).toContain('Strategie-Retreat Nordwind')
  })

  it('treats a wildcard as a character somebody typed', async () => {
    await makeWorkshop('100% Fokus', ownerId)
    const all = await list(as(ownerId), { search: '%' })
    // Were % passed through as a wildcard this would match everything.
    expect(all.workshops.every((row) => row.title.includes('%'))).toBe(true)
  })

  it('does not reach across the visibility rule', async () => {
    await makeWorkshop('Strategie geheim', colleagueId)
    const page = await list(as(ownerId), { search: 'Strategie geheim' })
    expect(page.workshops).toEqual([])
  })
})

describe('tags', () => {
  it('creates them on the way in and filters by them', async () => {
    const id = await makeWorkshop('Getaggt', ownerId)

    await withTenant(as(ownerId), async (tx) => {
      const access = await assertWorkshopAccess(tx, as(ownerId), id, 'workshop.update')
      await setWorkshopTags(tx, access, ['Onboarding', 'Vertrieb'])
    })

    expect((await withTenant(as(ownerId), (tx) => tagsOf(tx, id))).sort()).toEqual([
      'Onboarding',
      'Vertrieb',
    ])

    const tags = await withTenant(as(ownerId), (tx) => listTags(tx))
    const onboarding = tags.find((row) => row.name === 'Onboarding')!
    expect(onboarding.count).toBe(1)

    const page = await list(as(ownerId), { tagId: onboarding.id })
    expect(page.workshops.map((row) => row.id)).toEqual([id])
  })

  it('replaces the set rather than adding to it', async () => {
    const id = await makeWorkshop('Umgetaggt', ownerId)
    await withTenant(as(ownerId), async (tx) => {
      const access = await assertWorkshopAccess(tx, as(ownerId), id, 'workshop.update')
      await setWorkshopTags(tx, access, ['Alt'])
      await setWorkshopTags(tx, access, ['Neu'])
    })

    expect(await withTenant(as(ownerId), (tx) => tagsOf(tx, id))).toEqual(['Neu'])
  })

  it('forgets a tag nothing points at any more', async () => {
    const id = await makeWorkshop('Verwaist', ownerId)
    await withTenant(as(ownerId), async (tx) => {
      const access = await assertWorkshopAccess(tx, as(ownerId), id, 'workshop.update')
      await setWorkshopTags(tx, access, ['Einmalig'])
      await setWorkshopTags(tx, access, [])
      await pruneUnusedTags(tx)
    })

    const tags = await withTenant(as(ownerId), (tx) => listTags(tx))
    expect(tags.map((row) => row.name)).not.toContain('Einmalig')
  })

  it('refuses more tags than anybody reads', async () => {
    const id = await makeWorkshop('Zu viele', ownerId)
    await expect(
      withTenant(as(ownerId), async (tx) => {
        const access = await assertWorkshopAccess(tx, as(ownerId), id, 'workshop.update')
        await setWorkshopTags(
          tx,
          access,
          Array.from({ length: 20 }, (_, i) => `t${i}`),
        )
      }),
    ).rejects.toThrow(/Höchstens 12/)
  })
})
