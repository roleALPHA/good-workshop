import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { withTenant, type Actor } from '@/server/db'
import { NotFoundError, assertWorkshopAccess } from '@/domain/agenda/access'
import { loadWorkshopExport } from '@/server/export/workshop'
import { createFolder, listFolders } from './folders'
import { assertFolderAccess, listFolderAccess } from './folder-collaborators'
import { createWorkshop, moveWorkshopToFolder } from './repo'

/**
 * A folder somebody holds no role on is not there for them.
 *
 * Not only in the sidebar: a folder name reaches a person through the move
 * menu, the chip on a workshop row, the path at the top of an export and the
 * "via …" line on a sharing screen as well, and each of those is the same leak.
 * Neither can such a folder be a target -- a workshop moved into it would be
 * shared with its people by that move alone, and a subfolder made in it would
 * make a stranger the owner of a corner of somebody else's tree.
 */

const TENANT = randomUUID()
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

let creatorId: string
let colleagueId: string
let outsiderId: string
let adminId: string
let kundenId: string
let acmeId: string
let workshopId: string
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
    `v-${identityId}@example.test`,
    'active',
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, $4, 'active')`,
    [memberId, TENANT, identityId, role],
  )
  return memberId
}

async function makeFolder(name: string, parentId: string | null, ancestors: string[]) {
  const id = uuidv7()
  await ops.query(
    `insert into folder (id, tenant_id, parent_id, name, position, created_by, ancestor_ids)
     values ($1, $2, $3, $4, 'a0', $5, $6::uuid[])`,
    [id, TENANT, parentId, name, creatorId, ancestors],
  )
  return id
}

const grantFolder = (folderId: string, memberId: string, role: 'editor' | 'viewer' = 'viewer') =>
  ops.query(
    `insert into folder_collaborator (tenant_id, folder_id, member_id, role) values ($1, $2, $3, $4)`,
    [TENANT, folderId, memberId, role],
  )

const grantWorkshop = (id: string, memberId: string) =>
  ops.query(
    `insert into workshop_collaborator (tenant_id, workshop_id, member_id, role)
     values ($1, $2, $3, 'viewer')`,
    [TENANT, id, memberId],
  )

const folders = (actor: Actor) => withTenant(actor, (tx) => listFolders(tx, actor))
const names = async (actor: Actor) => (await folders(actor)).map((f) => f.name)

beforeAll(async () => {
  await ops.connect()
  await ops.query('insert into tenant (id, slug, name) values ($1, $2, $3)', [
    TENANT,
    `t-${TENANT.slice(0, 8)}`,
    'Ordnersicht',
  ])

  creatorId = await makeMember()
  colleagueId = await makeMember()
  // Made nothing, given nothing -- whatever they see came from the grant under test.
  outsiderId = await makeMember()
  adminId = await makeMember('admin')

  kundenId = await makeFolder('Kunden', null, [])
  acmeId = await makeFolder('Acme', kundenId, [kundenId])
  // A sibling nobody is given: what a grant on Kunden must not reach.
  await makeFolder('Intern', null, [])

  workshopId = uuidv7()
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position, folder_id)
     values ($1, $2, 'Bei Acme', $3, 'a0', $4)`,
    [workshopId, TENANT, creatorId, acmeId],
  )
})

afterAll(async () => {
  await ops.query('delete from workshop where tenant_id = $1', [TENANT])
  await ops.query('delete from folder where tenant_id = $1', [TENANT])
  await ops.query('delete from tenant where id = $1', [TENANT])
  for (const id of identities) await ops.query('delete from identity where id = $1', [id])
  await ops.end()
})

beforeEach(async () => {
  await ops.query('delete from folder_collaborator where tenant_id = $1', [TENANT])
  await ops.query('delete from workshop_collaborator where tenant_id = $1', [TENANT])
})

describe('the folder tree', () => {
  it('is empty for somebody who holds no role on any folder', async () => {
    expect(await folders(as(outsiderId))).toEqual([])
  })

  it('is whole for the creator and for an admin', async () => {
    expect(await names(as(creatorId))).toEqual(['Intern', 'Kunden', 'Acme'])
    expect(await names(as(adminId, 'admin'))).toEqual(['Intern', 'Kunden', 'Acme'])
  })

  it('reaches down from a grant, and not sideways', async () => {
    await grantFolder(kundenId, colleagueId)

    const tree = await folders(as(colleagueId))
    expect(tree.map((f) => [f.name, f.depth])).toEqual([
      ['Kunden', 0],
      ['Acme', 1],
    ])
  })

  /**
   * Not "Kunden, greyed out": the name of a folder is already what it tells
   * about the work, and the person was given Acme. So Acme stands at the top --
   * with no parent and no path that names one, or the move menu would still
   * carry an id that leads somewhere they may not go.
   */
  it('puts a folder at the top when the one above it is not theirs', async () => {
    await grantFolder(acmeId, colleagueId)

    expect(await folders(as(colleagueId))).toEqual([
      { id: acmeId, name: 'Acme', parentId: null, depth: 0, ancestorIds: [] },
    ])
  })

  it('shows somebody the folder they made themselves', async () => {
    const own = await withTenant(as(outsiderId), (tx) =>
      createFolder(tx, as(outsiderId), 'Eigenes', null),
    )

    expect(await names(as(outsiderId))).toEqual(['Eigenes'])
    expect(await names(as(colleagueId))).not.toContain('Eigenes')
    await ops.query('delete from folder where id = $1', [own])
  })

  it('does not follow a workshop shared on its own into the folder it sits in', async () => {
    await grantWorkshop(workshopId, outsiderId)

    expect(await folders(as(outsiderId))).toEqual([])
  })
})

describe('a folder that is not theirs', () => {
  it('cannot hold a new folder of theirs', async () => {
    await expect(
      withTenant(as(outsiderId), (tx) => createFolder(tx, as(outsiderId), 'Hinein', kundenId)),
    ).rejects.toThrow(NotFoundError)
  })

  it('cannot hold a new workshop of theirs', async () => {
    await expect(
      withTenant(as(outsiderId), (tx) =>
        createWorkshop(tx, as(outsiderId), { title: 'Neu', folderId: acmeId, dayTitle: 'Tag 1' }),
      ),
    ).rejects.toThrow('folder.targetGone')
  })

  it('cannot take in a workshop of theirs', async () => {
    const own = uuidv7()
    await ops.query(
      `insert into workshop (id, tenant_id, title, owner_id, position)
       values ($1, $2, 'Lose', $3, 'a0')`,
      [own, TENANT, outsiderId],
    )

    await expect(
      withTenant(as(outsiderId), async (tx) =>
        moveWorkshopToFolder(
          tx,
          await assertWorkshopAccess(tx, as(outsiderId), own, 'workshop.update'),
          acmeId,
        ),
      ),
    ).rejects.toThrow('folder.targetGone')
  })
})

describe('the path of an export', () => {
  const pathFor = (actor: Actor) =>
    withTenant(actor, async (tx) => {
      const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.read')
      return (await loadWorkshopExport(tx, access, 'de')).meta.folderPath
    })

  it('names only the folders the reader holds a role on', async () => {
    await grantWorkshop(workshopId, outsiderId)
    await grantFolder(acmeId, colleagueId)

    expect(await pathFor(as(outsiderId))).toEqual([])
    expect(await pathFor(as(colleagueId))).toEqual(['Acme'])
    expect(await pathFor(as(creatorId))).toEqual(['Kunden', 'Acme'])
  })
})

describe('"via …" on a sharing screen', () => {
  it('does not name a folder above that the reader holds no role on', async () => {
    await grantFolder(kundenId, colleagueId, 'editor')
    await grantFolder(acmeId, outsiderId)

    const entries = await withTenant(as(outsiderId), async (tx) =>
      listFolderAccess(tx, await assertFolderAccess(tx, as(outsiderId), acmeId)),
    )
    const of = (id: string) => entries.find((entry) => entry.memberId === id)?.inherited

    expect(of(colleagueId)).toEqual({ role: 'editor', folderId: null, folderName: null })
    expect(of(creatorId)).toEqual({ role: 'owner', folderId: null, folderName: null })
  })

  it('still names it for somebody who holds one', async () => {
    await grantFolder(kundenId, colleagueId, 'editor')

    const entries = await withTenant(as(colleagueId), async (tx) =>
      listFolderAccess(tx, await assertFolderAccess(tx, as(colleagueId), acmeId)),
    )
    expect(entries.find((entry) => entry.memberId === creatorId)?.inherited).toEqual({
      role: 'owner',
      folderId: kundenId,
      folderName: 'Kunden',
    })
  })
})
