import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withTenant, type Actor } from '@/server/db'
import { assertWorkshopAccess } from '@/domain/agenda/access'
import {
  createFolder,
  FolderMoveError,
  listFolders,
  listWorkshops,
  moveFolder,
  moveWorkshopToFolder,
  WorkshopFolderError,
} from './repo'

/**
 * Filing: putting a workshop in a folder, and putting folders in order.
 *
 * Two rules carry the whole feature and are easy to break by accident. Filing
 * must not touch `updated_at` -- the library is sorted by it, so a tidying-up
 * pass would reshuffle the list under the hands of the person tidying. And a
 * folder dropped between two siblings must actually land there, which it does
 * not if the early return for "same parent" survives.
 */

const TENANT = randomUUID()
const OTHER = randomUUID()
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

let ownerId: string
let adminId: string
let strangerId: string
const identities: string[] = []

const as = (
  memberId: string,
  tenantRole: 'member' | 'admin' = 'member',
  tenantId: string = TENANT,
): Actor => ({ tenantId, memberId, tenantRole, source: 'web' })

async function makeMember(
  role: 'member' | 'admin' = 'member',
  tenantId: string = TENANT,
): Promise<string> {
  const identityId = randomUUID()
  const memberId = randomUUID()
  identities.push(identityId)

  await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
    identityId,
    `m-${identityId}@example.test`,
    'active',
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, $4, 'active')`,
    [memberId, tenantId, identityId, role],
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

/** The folder move is an admin's call, so every fixture folder is made as one. */
const admin = () => as(adminId, 'admin')
const folderNamed = (name: string, parentId: string | null = null) =>
  withTenant(admin(), (tx) => createFolder(tx, admin(), name, parentId))

const file = (workshopId: string, folderId: string | null, actor: Actor = as(ownerId)) =>
  withTenant(actor, async (tx) =>
    moveWorkshopToFolder(
      tx,
      await assertWorkshopAccess(tx, actor, workshopId, 'workshop.update'),
      folderId,
    ),
  )

/** The ids of one sibling list, in the order listFolders returns them. */
async function siblingOrder(parentId: string | null): Promise<string[]> {
  const folders = await withTenant(admin(), (tx) => listFolders(tx))
  return folders.filter((node) => node.parentId === parentId).map((node) => node.id)
}

beforeAll(async () => {
  await ops.connect()
  for (const id of [TENANT, OTHER]) {
    await ops.query('insert into tenant (id, slug, name) values ($1, $2, $3)', [
      id,
      `t-${id.slice(0, 8)}`,
      'Einsortieren',
    ])
  }
  ownerId = await makeMember()
  adminId = await makeMember('admin')
  strangerId = await makeMember('admin', OTHER)
})

afterAll(async () => {
  for (const id of [TENANT, OTHER]) {
    await ops.query('delete from workshop where tenant_id = $1', [id])
    await ops.query('delete from folder where tenant_id = $1', [id])
    await ops.query('delete from tenant where id = $1', [id])
  }
  for (const id of identities) await ops.query('delete from identity where id = $1', [id])
  await ops.end()
})

describe('filing a workshop', () => {
  it('puts it in the folder, and takes it out of the one it was in', async () => {
    const from = await folderNamed('Vorher')
    const to = await folderNamed('Nachher')
    const id = await makeWorkshop('Strategie-Retreat', ownerId, from)

    await file(id, to)

    const inTarget = await withTenant(as(ownerId), (tx) =>
      listWorkshops(tx, as(ownerId), { folderId: to }),
    )
    const inSource = await withTenant(as(ownerId), (tx) =>
      listWorkshops(tx, as(ownerId), { folderId: from }),
    )
    expect(inTarget.workshops.map((w) => w.id)).toContain(id)
    expect(inSource.workshops.map((w) => w.id)).not.toContain(id)
  })

  it('takes it out of every folder when the target is the top level', async () => {
    const somewhere = await folderNamed('Irgendwo')
    const id = await makeWorkshop('Raus damit', ownerId, somewhere)

    await file(id, null)

    const top = await withTenant(as(ownerId), (tx) =>
      listWorkshops(tx, as(ownerId), { folderId: null }),
    )
    expect(top.workshops.map((w) => w.id)).toContain(id)
  })

  /**
   * The load-bearing assertion of the whole feature.
   *
   * listWorkshops sorts by updated_at, so bumping it here would make every row
   * jump to the top of the list the moment somebody files it -- ten workshops
   * tidied away means watching the list rebuild itself ten times.
   */
  it('does not count as editing the workshop', async () => {
    const target = await folderNamed('Ablage')
    const id = await makeWorkshop('Unberührt', ownerId)
    const before = await ops.query('select updated_at from workshop where id = $1', [id])

    await file(id, target)

    const after = await ops.query('select updated_at, updated_by from workshop where id = $1', [id])
    expect(after.rows[0]?.updated_at).toEqual(before.rows[0]?.updated_at)
    expect(after.rows[0]?.updated_by).toBe(ownerId)
  })

  it('refuses a folder that is not there', async () => {
    const id = await makeWorkshop('Ins Leere', ownerId)

    await expect(file(id, randomUUID())).rejects.toThrow(WorkshopFolderError)
    await expect(file(id, randomUUID())).rejects.toThrow('folder.targetGone')
  })

  /**
   * Cross-tenant: the folder exists, but not for this actor. RLS hides the row,
   * so the pre-check answers "gone" before the composite foreign key ever gets
   * the chance to fail in a way nobody can read.
   */
  it('cannot reach a folder in another tenant', async () => {
    const foreign = await withTenant(as(strangerId, 'admin', OTHER), (tx) =>
      createFolder(tx, as(strangerId, 'admin', OTHER), 'Fremd', null),
    )
    const id = await makeWorkshop('Bleibt hier', ownerId)

    await expect(file(id, foreign)).rejects.toThrow('folder.targetGone')

    const { rows } = await ops.query('select folder_id from workshop where id = $1', [id])
    expect(rows[0]?.folder_id).toBeNull()
  })
})

describe('ordering folders', () => {
  it('moves a folder behind one of its siblings without changing its parent', async () => {
    const parent = await folderNamed('Kunden')
    const a = await folderNamed('Alpha', parent)
    const b = await folderNamed('Beta', parent)
    const c = await folderNamed('Gamma', parent)
    expect(await siblingOrder(parent)).toEqual([a, b, c])

    // The case the early return used to swallow: same parent, new place.
    await withTenant(admin(), (tx) => moveFolder(tx, c, parent, a))

    expect(await siblingOrder(parent)).toEqual([a, c, b])
  })

  it('puts a folder first when there is nothing to land behind', async () => {
    const parent = await folderNamed('Projekte')
    const a = await folderNamed('Eins', parent)
    const b = await folderNamed('Zwei', parent)

    await withTenant(admin(), (tx) => moveFolder(tx, b, parent, null))

    expect(await siblingOrder(parent)).toEqual([b, a])
  })

  it('lands where it was aimed after changing parent, not at an arbitrary spot', async () => {
    const from = await folderNamed('Herkunft')
    const to = await folderNamed('Ziel')
    const first = await folderNamed('Erster', to)
    const second = await folderNamed('Zweiter', to)
    const moving = await folderNamed('Wanderer', from)

    await withTenant(admin(), (tx) => moveFolder(tx, moving, to, first))

    expect(await siblingOrder(to)).toEqual([first, moving, second])

    // The materialised path came along, or the tree view would draw the old shape.
    const { rows } = await ops.query('select ancestor_ids from folder where id = $1', [moving])
    expect(rows[0]?.ancestor_ids).toEqual([to])
  })

  it('carries the whole subtree and its paths to the new parent', async () => {
    const to = await folderNamed('Neuer Ort')
    const branch = await folderNamed('Zweig')
    const leaf = await folderNamed('Blatt', branch)

    await withTenant(admin(), (tx) => moveFolder(tx, branch, to, null))

    const { rows } = await ops.query('select ancestor_ids from folder where id = $1', [leaf])
    expect(rows[0]?.ancestor_ids).toEqual([to, branch])
  })

  /**
   * folder_sibling_name_uq is case-insensitive, and two projects each holding
   * an "Archiv" is the most ordinary folder drag there is. Without this the
   * unique index turns it into "Etwas ist schiefgegangen".
   */
  it('says so when the target already holds a folder of that name', async () => {
    const target = await folderNamed('Sammelstelle')
    await folderNamed('Archiv', target)
    const elsewhere = await folderNamed('Anderswo')
    const mine = await folderNamed('archiv', elsewhere)

    await expect(withTenant(admin(), (tx) => moveFolder(tx, mine, target, null))).rejects.toThrow(
      FolderMoveError,
    )
    await expect(withTenant(admin(), (tx) => moveFolder(tx, mine, target, null))).rejects.toThrow(
      'folder.nameTaken',
    )
  })

  it('still refuses a move into its own descendant', async () => {
    const top = await folderNamed('Oben')
    const below = await folderNamed('Darunter', top)

    await expect(withTenant(admin(), (tx) => moveFolder(tx, top, below, null))).rejects.toThrow(
      'folder.intoOwnDescendant',
    )
  })
})
