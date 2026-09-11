import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { withTenant, type Actor } from '@/server/db'
import { NotFoundError, assertWorkshopAccess } from '@/domain/agenda/access'
import {
  SharingError,
  listCollaborators,
  removeCollaborator,
  setCollaborator,
} from './collaborators'

/**
 * Sharing against a real database.
 *
 * The assertion that matters is the one about a colleague who has NOT been
 * shared with: they must get "not found", from the same code path everyone
 * else uses. A sharing screen that grants access correctly but leaves the
 * ungranted case to a check somewhere else is how a workshop leaks.
 */

const TENANT = randomUUID()
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

let ownerId: string
let colleagueId: string
let strangerId: string
let workshopId: string
const identities: string[] = []

const as = (memberId: string, tenantRole: 'member' | 'admin' = 'member'): Actor => ({
  tenantId: TENANT,
  memberId,
  tenantRole,
  source: 'web',
})

async function makeMember(): Promise<string> {
  const identityId = randomUUID()
  const memberId = randomUUID()
  identities.push(identityId)

  await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
    identityId,
    `c-${identityId}@example.test`,
    'active',
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
    [memberId, TENANT, identityId],
  )
  return memberId
}

beforeAll(async () => {
  await ops.connect()
  await ops.query('insert into tenant (id, slug, name) values ($1, $2, $3)', [
    TENANT,
    `t-${TENANT.slice(0, 8)}`,
    'Freigabetest',
  ])

  ownerId = await makeMember()
  colleagueId = await makeMember()
  strangerId = await makeMember()

  workshopId = uuidv7()
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Geteilt', $3, 'a0')`,
    [workshopId, TENANT, ownerId],
  )
})

afterAll(async () => {
  await ops.query('delete from workshop where tenant_id = $1', [TENANT])
  await ops.query('delete from tenant where id = $1', [TENANT])
  for (const id of identities) await ops.query('delete from identity where id = $1', [id])
  await ops.end()
})

beforeEach(async () => {
  await ops.query('delete from workshop_collaborator where workshop_id = $1', [workshopId])
})

const share = (memberId: string, role: 'editor' | 'viewer') =>
  withTenant(as(ownerId), async (tx) => {
    const access = await assertWorkshopAccess(tx, as(ownerId), workshopId, 'workshop.share')
    await setCollaborator(tx, access, memberId, role)
  })

const capabilitiesOf = (memberId: string) =>
  withTenant(as(memberId), async (tx) => {
    const access = await assertWorkshopAccess(tx, as(memberId), workshopId, 'workshop.read')
    return {
      read: access.can('workshop.read'),
      write: access.can('workshop.content.write'),
      share: access.can('workshop.share'),
    }
  })

describe('a colleague who has not been shared with', () => {
  it('cannot even see that the workshop exists', async () => {
    await expect(capabilitiesOf(strangerId)).rejects.toThrow(NotFoundError)
  })
})

describe('setCollaborator', () => {
  it('turns a colleague into an editor who may write', async () => {
    await share(colleagueId, 'editor')
    expect(await capabilitiesOf(colleagueId)).toEqual({ read: true, write: true, share: false })
  })

  it('turns a colleague into a viewer who may not', async () => {
    await share(colleagueId, 'viewer')
    expect(await capabilitiesOf(colleagueId)).toEqual({ read: true, write: false, share: false })
  })

  it('changes an existing role rather than adding a second row', async () => {
    await share(colleagueId, 'editor')
    await share(colleagueId, 'viewer')

    const rows = await ops.query(
      'select role from workshop_collaborator where workshop_id = $1 and member_id = $2',
      [workshopId, colleagueId],
    )
    expect(rows.rows.map((row: { role: string }) => row.role)).toEqual(['viewer'])
  })

  it('refuses the owner, who already has more than any role could grant', async () => {
    await expect(share(ownerId, 'viewer')).rejects.toThrow(SharingError)
  })

  it('refuses somebody who is switched off', async () => {
    await ops.query(`update member set status = 'disabled' where id = $1`, [colleagueId])
    await expect(share(colleagueId, 'editor')).rejects.toThrow('sharing.memberDisabled')
    await ops.query(`update member set status = 'active' where id = $1`, [colleagueId])
  })

  it('refuses a member id that is not in this tenant', async () => {
    await expect(share(randomUUID(), 'editor')).rejects.toThrow('sharing.memberGone')
  })
})

describe('removeCollaborator', () => {
  it('takes the access away again', async () => {
    await share(colleagueId, 'editor')
    await withTenant(as(ownerId), async (tx) => {
      const access = await assertWorkshopAccess(tx, as(ownerId), workshopId, 'workshop.share')
      await removeCollaborator(tx, access, colleagueId)
    })

    await expect(capabilitiesOf(colleagueId)).rejects.toThrow(NotFoundError)
  })
})

describe('listCollaborators', () => {
  it('reports the owner and everyone who was added', async () => {
    await share(colleagueId, 'viewer')

    const result = await withTenant(as(ownerId), async (tx) => {
      const access = await assertWorkshopAccess(tx, as(ownerId), workshopId, 'workshop.read')
      return listCollaborators(tx, access)
    })

    expect(result.ownerId).toBe(ownerId)
    expect(result.collaborators).toEqual([{ memberId: colleagueId, role: 'viewer' }])
  })
})
