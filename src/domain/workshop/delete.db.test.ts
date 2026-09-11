import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withTenant, type Actor } from '@/server/db'
import { assertWorkshopAccess } from '@/domain/agenda/access'
import {
  createFolder,
  deleteFolder,
  listFolders,
  listTrashedWorkshops,
  listWorkshops,
  purgeWorkshop,
  restoreWorkshop,
  trashWorkshop,
} from './repo'

/**
 * Throwing things away, and getting them back.
 *
 * A workshop is weeks of preparation, so the bin is not a nicety: "I deleted
 * the wrong one" has to be survivable without a database restore. The tests
 * that matter here are the ones about the door -- who may throw away, that a
 * purge cannot skip the bin, and that deleting a folder never takes somebody
 * else's workshop with it.
 */

const TENANT = randomUUID()
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

let ownerId: string
let colleagueId: string
let adminId: string
const identities: string[] = []

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
    `d-${identityId}@example.test`,
    'active',
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, $4, 'active')`,
    [memberId, TENANT, identityId, role],
  )
  return memberId
}

async function makeWorkshop(title: string, owner: string, folderId: string | null = null) {
  const id = uuidv7()
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position, folder_id)
     values ($1, $2, $3, $4, 'a0', $5)`,
    [id, TENANT, title, owner, folderId],
  )
  return id
}

const access = (actor: Actor, workshopId: string, capability: 'workshop.delete') =>
  withTenant(actor, (tx) => assertWorkshopAccess(tx, actor, workshopId, capability))

beforeAll(async () => {
  await ops.connect()
  await ops.query('insert into tenant (id, slug, name) values ($1, $2, $3)', [
    TENANT,
    `t-${TENANT.slice(0, 8)}`,
    'Löschtest',
  ])
  ownerId = await makeMember()
  colleagueId = await makeMember()
  adminId = await makeMember('admin')
})

afterAll(async () => {
  await ops.query('delete from workshop where tenant_id = $1', [TENANT])
  await ops.query('delete from folder where tenant_id = $1', [TENANT])
  await ops.query('delete from tenant where id = $1', [TENANT])
  for (const id of identities) await ops.query('delete from identity where id = $1', [id])
  await ops.end()
})

describe('the bin', () => {
  it('takes a workshop out of the library without losing it', async () => {
    const id = await makeWorkshop('Wegwerfen', ownerId)
    await withTenant(as(ownerId), async (tx) =>
      trashWorkshop(tx, await assertWorkshopAccess(tx, as(ownerId), id, 'workshop.delete')),
    )

    const page = await withTenant(as(ownerId), (tx) => listWorkshops(tx, as(ownerId), {}))
    expect(page.workshops.map((w) => w.id)).not.toContain(id)

    const trash = await withTenant(as(ownerId), (tx) => listTrashedWorkshops(tx, as(ownerId)))
    expect(trash.map((w) => w.id)).toContain(id)
  })

  it('puts it back where it was', async () => {
    const id = await makeWorkshop('Zurückholen', ownerId)
    await withTenant(as(ownerId), async (tx) =>
      trashWorkshop(tx, await assertWorkshopAccess(tx, as(ownerId), id, 'workshop.delete')),
    )

    // The access check is fetched AFTER the row went into the bin, exactly as
    // the server action does it. Reusing the one from before the delete is what
    // hid the bug this test now covers: assertWorkshopAccess filters trashed
    // rows out, so restore could never find its own subject.
    await withTenant(as(ownerId), async (tx) =>
      restoreWorkshop(
        tx,
        await assertWorkshopAccess(tx, as(ownerId), id, 'workshop.delete', {
          includeTrashed: true,
        }),
      ),
    )

    const page = await withTenant(as(ownerId), (tx) => listWorkshops(tx, as(ownerId), {}))
    expect(page.workshops.map((w) => w.id)).toContain(id)
  })

  it('hides a trashed workshop from the access check unless it is asked for', async () => {
    const id = await makeWorkshop('Versteckt', ownerId)
    await withTenant(as(ownerId), async (tx) =>
      trashWorkshop(tx, await assertWorkshopAccess(tx, as(ownerId), id, 'workshop.delete')),
    )

    // Every editor route depends on this: a workshop in the bin is gone.
    await expect(
      withTenant(as(ownerId), (tx) => assertWorkshopAccess(tx, as(ownerId), id, 'workshop.read')),
    ).rejects.toThrow()

    await expect(
      withTenant(as(ownerId), (tx) =>
        assertWorkshopAccess(tx, as(ownerId), id, 'workshop.delete', { includeTrashed: true }),
      ),
    ).resolves.toBeTruthy()
  })

  it('refuses to purge a workshop that is not in the bin', async () => {
    const id = await makeWorkshop('Noch da', ownerId)
    const removed = await withTenant(as(ownerId), async (tx) =>
      purgeWorkshop(tx, await assertWorkshopAccess(tx, as(ownerId), id, 'workshop.delete')),
    )

    // Two decisions at two moments: there is no single click that ends weeks
    // of preparation.
    expect(removed).toBe(0)
    const page = await withTenant(as(ownerId), (tx) => listWorkshops(tx, as(ownerId), {}))
    expect(page.workshops.map((w) => w.id)).toContain(id)
  })

  it('purges for good once it is in the bin', async () => {
    const id = await makeWorkshop('Endgültig', ownerId)
    await withTenant(as(ownerId), async (tx) =>
      trashWorkshop(tx, await assertWorkshopAccess(tx, as(ownerId), id, 'workshop.delete')),
    )
    await withTenant(as(ownerId), async (tx) => {
      const a = await assertWorkshopAccess(tx, as(ownerId), id, 'workshop.delete', {
        includeTrashed: true,
      })
      expect(await purgeWorkshop(tx, a)).toBe(1)
    })

    const { rows } = await ops.query('select 1 from workshop where id = $1', [id])
    expect(rows).toHaveLength(0)
  })

  it('lets nobody but the owner and a tenant admin throw a workshop away', async () => {
    const id = await makeWorkshop('Fremder', ownerId)

    await expect(access(as(colleagueId), id, 'workshop.delete')).rejects.toThrow()
    // The admin may: somebody has to be able to tidy up after a person who left.
    await expect(access(as(adminId, 'admin'), id, 'workshop.delete')).resolves.toBeTruthy()
  })

  it('keeps one tenant out of another tenant’s bin', async () => {
    const id = await makeWorkshop('Geheim', ownerId)
    await withTenant(as(ownerId), async (tx) =>
      trashWorkshop(tx, await assertWorkshopAccess(tx, as(ownerId), id, 'workshop.delete')),
    )

    const stranger: Actor = { ...as(colleagueId), tenantId: randomUUID() }
    const trash = await withTenant(stranger, (tx) => listTrashedWorkshops(tx, stranger))
    expect(trash.map((w) => w.id)).not.toContain(id)
  })
})

describe('deleting a folder', () => {
  it('lifts its contents one level up instead of taking them along', async () => {
    const outer = await withTenant(as(adminId, 'admin'), (tx) =>
      createFolder(tx, as(adminId, 'admin'), 'Außen', null),
    )
    const inner = await withTenant(as(adminId, 'admin'), (tx) =>
      createFolder(tx, as(adminId, 'admin'), 'Innen', outer),
    )
    const deep = await withTenant(as(adminId, 'admin'), (tx) =>
      createFolder(tx, as(adminId, 'admin'), 'Ganz innen', inner),
    )
    const inside = await makeWorkshop('Im Ordner', ownerId, inner)

    await withTenant(as(adminId, 'admin'), (tx) => deleteFolder(tx, inner))

    // The workshop survived, and moved to where the folder used to be.
    const { rows } = await ops.query('select folder_id from workshop where id = $1', [inside])
    expect(rows[0]?.folder_id).toBe(outer)

    // And the tree below it is still a tree: the descendant no longer claims a
    // parent that does not exist.
    const folders = await withTenant(as(adminId, 'admin'), (tx) => listFolders(tx))
    expect(folders.find((f) => f.id === deep)?.parentId).toBe(outer)

    // The materialised path is read from the row rather than from FolderNode,
    // which does not carry it -- asserting on a field the type does not have
    // passes against undefined and proves nothing.
    const paths = await ops.query('select ancestor_ids from folder where id = $1', [deep])
    expect(paths.rows[0]?.ancestor_ids).not.toContain(inner)
    expect(paths.rows[0]?.ancestor_ids).toContain(outer)
  })
})
