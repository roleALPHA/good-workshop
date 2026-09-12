import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { withTenant, type Actor } from '@/server/db'
import { NotFoundError, assertWorkshopAccess } from '@/domain/agenda/access'
import { listWorkshops } from './repo'
import {
  FolderSharingError,
  assertFolderAccess,
  removeFolderCollaborator,
  setFolderCollaborator,
} from './folder-collaborators'

/**
 * Folder collaboration against a real database.
 *
 * Three things cannot be asserted without one, and each is a leak if it is
 * wrong: that the grant reaches the whole subtree, that the library predicate
 * and the single-workshop check agree about who sees what, and that a row in
 * one tenant is invisible in another.
 */

const TENANT = randomUUID()
const OTHER_TENANT = randomUUID()
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

let creatorId: string
let colleagueId: string
let strangerId: string
let outsiderId: string
let otherTenantMemberId: string
let rootId: string
let childId: string
let workshopId: string
const identities: string[] = []

const as = (memberId: string, tenantRole: 'member' | 'admin' = 'member'): Actor => ({
  tenantId: TENANT,
  memberId,
  tenantRole,
  source: 'web',
})

async function makeMember(tenantId = TENANT): Promise<string> {
  const identityId = randomUUID()
  const memberId = randomUUID()
  identities.push(identityId)
  await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
    identityId,
    `f-${identityId}@example.test`,
    'active',
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
    [memberId, tenantId, identityId],
  )
  return memberId
}

beforeAll(async () => {
  await ops.connect()
  for (const [id, slug] of [
    [TENANT, `t-${TENANT.slice(0, 8)}`],
    [OTHER_TENANT, `t-${OTHER_TENANT.slice(0, 8)}`],
  ]) {
    await ops.query('insert into tenant (id, slug, name) values ($1, $2, $3)', [
      id,
      slug,
      'Ordnerfreigabe',
    ])
  }

  creatorId = await makeMember()
  colleagueId = await makeMember()
  strangerId = await makeMember()
  // Owns nothing and is in no folder -- so a role they end up with came from
  // the grant under test and from nowhere else.
  outsiderId = await makeMember()
  otherTenantMemberId = await makeMember(OTHER_TENANT)

  // Kunden / Acme, with the workshop two levels down and owned by somebody who
  // is not the folder's creator -- which is the whole point of a folder grant.
  rootId = uuidv7()
  childId = uuidv7()
  await ops.query(
    `insert into folder (id, tenant_id, name, position, created_by, ancestor_ids)
     values ($1, $2, 'Kunden', 'a0', $3, '{}')`,
    [rootId, TENANT, creatorId],
  )
  await ops.query(
    `insert into folder (id, tenant_id, parent_id, name, position, created_by, ancestor_ids)
     values ($1, $2, $3, 'Acme', 'a0', $4, array[$3::uuid])`,
    [childId, TENANT, rootId, creatorId],
  )

  workshopId = uuidv7()
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position, folder_id)
     values ($1, $2, 'Im Ordner', $3, 'a0', $4)`,
    [workshopId, TENANT, strangerId, childId],
  )
})

afterAll(async () => {
  for (const t of [TENANT, OTHER_TENANT]) {
    await ops.query('delete from workshop where tenant_id = $1', [t])
    await ops.query('delete from folder where tenant_id = $1', [t])
    await ops.query('delete from tenant where id = $1', [t])
  }
  for (const id of identities) await ops.query('delete from identity where id = $1', [id])
  await ops.end()
})

beforeEach(async () => {
  await ops.query('delete from folder_collaborator where tenant_id = $1', [TENANT])
})

const grant = (actorId: string, folderId: string, memberId: string, role: 'editor' | 'viewer') =>
  withTenant(as(actorId), async (tx) => {
    const access = await assertFolderAccess(tx, as(actorId), folderId)
    await setFolderCollaborator(tx, access, memberId, role)
  })

const workshopRole = (memberId: string) =>
  withTenant(as(memberId), async (tx) => {
    const access = await assertWorkshopAccess(tx, as(memberId), workshopId, 'workshop.read')
    return access.role
  })

const libraryTitles = (memberId: string) =>
  withTenant(as(memberId), async (tx) =>
    (await listWorkshops(tx, as(memberId))).workshops.map((w) => w.title),
  )

describe('a grant on a folder', () => {
  it('reaches a workshop two levels down, owned by somebody else', async () => {
    await expect(workshopRole(colleagueId)).rejects.toThrow(NotFoundError)

    await grant(creatorId, rootId, colleagueId, 'editor')

    expect(await workshopRole(colleagueId)).toBe('editor')
  })

  it('puts that workshop in the library, which is the half that is easy to forget', async () => {
    // A workshop that can be opened but never appears in the list is a grant
    // nobody can use; one that appears and then 404s is worse.
    expect(await libraryTitles(colleagueId)).not.toContain('Im Ordner')

    await grant(creatorId, rootId, colleagueId, 'viewer')

    expect(await libraryTitles(colleagueId)).toContain('Im Ordner')
  })

  it('is narrowed by a nearer folder', async () => {
    await grant(creatorId, rootId, colleagueId, 'editor')
    await grant(creatorId, childId, colleagueId, 'viewer')

    expect(await workshopRole(colleagueId)).toBe('viewer')
  })

  it('never confers ownership, however the folder was reached', async () => {
    await grant(creatorId, rootId, colleagueId, 'editor')

    await withTenant(as(colleagueId), async (tx) => {
      // Deleting or transferring a colleague's workshop is not something
      // filing it in a shared folder may confer.
      await expect(
        assertWorkshopAccess(tx, as(colleagueId), workshopId, 'workshop.delete'),
      ).rejects.toThrow(/forbidden/)
    })
  })
})

describe('handing on', () => {
  it('lets an editor make another editor', async () => {
    await grant(creatorId, rootId, colleagueId, 'editor')
    await grant(colleagueId, rootId, outsiderId, 'editor')

    // `outsiderId` and not `strangerId`: the latter OWNS this workshop, so the
    // answer would have been 'owner' with or without the grant -- a test that
    // passes for a reason that has nothing to do with its name.
    expect(await workshopRole(outsiderId)).toBe('editor')
  })

  it('refuses a viewer trying to make an editor', async () => {
    await grant(creatorId, rootId, colleagueId, 'viewer')

    await expect(grant(colleagueId, rootId, outsiderId, 'editor')).rejects.toThrow(
      FolderSharingError,
    )
  })

  it('lets a viewer make another viewer, because equal is not more', async () => {
    await grant(creatorId, rootId, colleagueId, 'viewer')
    await grant(colleagueId, rootId, outsiderId, 'viewer')

    expect(await workshopRole(outsiderId)).toBe('viewer')
  })

  it('refuses a viewer taking an editor away, which is the same rule backwards', async () => {
    await grant(creatorId, rootId, colleagueId, 'viewer')
    await grant(creatorId, rootId, outsiderId, 'editor')

    await withTenant(as(colleagueId), async (tx) => {
      const access = await assertFolderAccess(tx, as(colleagueId), rootId)
      await expect(removeFolderCollaborator(tx, access, outsiderId)).rejects.toThrow(
        FolderSharingError,
      )
    })
  })

  it('refuses somebody with no access to the folder at all', async () => {
    await expect(grant(strangerId, rootId, colleagueId, 'viewer')).rejects.toThrow(
      FolderSharingError,
    )
  })
})

describe('the tenant boundary', () => {
  it('hides a grant from another tenant entirely', async () => {
    await grant(creatorId, rootId, colleagueId, 'editor')

    const seen = await withTenant(
      {
        tenantId: OTHER_TENANT,
        memberId: otherTenantMemberId,
        tenantRole: 'member',
        source: 'web',
      },
      async (tx) => tx.execute(`select count(*)::int as n from folder_collaborator`),
    )

    expect((seen.rows[0] as { n: number }).n).toBe(0)
  })

  it('refuses a row written with a foreign tenant_id', async () => {
    await expect(
      withTenant(as(creatorId), async (tx) =>
        tx.execute(
          `insert into folder_collaborator (tenant_id, folder_id, member_id, role)
           values ('${OTHER_TENANT}', '${rootId}', '${colleagueId}', 'viewer')`,
        ),
      ),
    ).rejects.toThrow()
  })
})
