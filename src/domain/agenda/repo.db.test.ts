import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { withTenant, type Actor } from '@/server/db'
import { assertWorkshopAccess, ForbiddenError, NotFoundError } from './access'
import { assertDayInWorkshop, loadDay } from './repo'
import { flattenDay } from '@/features/agenda/flatten'

/**
 * The repository against a real database.
 *
 * The repository reads; the materialiser writes. So the blocks here are seeded
 * with SQL, in the shape the materialiser leaves behind, and what is under test
 * is the read and the guard -- not a second way to write, which is what the
 * mutations that used to stand here had become.
 *
 * What only a real database can prove: that the day-consistency composite FKs
 * actually reject a block whose cluster lives on another day and one whose day
 * belongs to another workshop, and that the WITH CHECK half of the tenant policy
 * actually fires. All of them are invariants the application is allowed to rely
 * on, so they had better be true.
 */

const TENANT = '00000000-0000-0000-0000-000000000001'
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

let ownerId: string
let identityId: string
let workshopId: string
let dayId: string
let otherDayId: string
let clusterId: string
let breakTypeId: string

// A workshop belonging to somebody else, with something in it worth stealing.
// The owner above has no relationship to it of any kind.
let strangerId: string
let strangerIdentityId: string
let foreignWorkshopId: string
let foreignDayId: string
let foreignClusterId: string
let foreignModuleId: string

const owner = (): Actor => ({
  tenantId: TENANT,
  memberId: ownerId,
  tenantRole: 'member',
  source: 'web',
})

beforeAll(async () => {
  await ops.connect()
  await ops.query(
    `insert into tenant (id, slug, name) values ($1, 'default', 'Test') on conflict (id) do nothing`,
    [TENANT],
  )
  identityId = randomUUID()
  ownerId = randomUUID()
  await ops.query('insert into identity (id, email) values ($1, $2)', [
    identityId,
    `repo-${identityId}@example.test`,
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
    [ownerId, TENANT, identityId],
  )
  const { rows } = await ops.query(
    `select id from module_type where tenant_id = $1 and key = 'break'`,
    [TENANT],
  )
  breakTypeId = rows[0].id

  strangerIdentityId = randomUUID()
  strangerId = randomUUID()
  await ops.query('insert into identity (id, email) values ($1, $2)', [
    strangerIdentityId,
    `stranger-${strangerIdentityId}@example.test`,
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
    [strangerId, TENANT, strangerIdentityId],
  )
})

afterAll(async () => {
  // Workshops first: workshop.owner_id is ON DELETE RESTRICT, so removing a
  // member who still owns workshops is refused. That is the constraint working
  // -- deleting somebody must not silently take their workshops with them --
  // and the teardown has to respect it like any other caller would.
  await ops.query('delete from workshop where owner_id = any($1::uuid[])', [[ownerId, strangerId]])
  await ops.query('delete from identity where id = any($1::uuid[])', [
    [identityId, strangerIdentityId],
  ])
  await ops.end()
})

beforeEach(async () => {
  workshopId = uuidv7()
  dayId = uuidv7()
  otherDayId = uuidv7()
  clusterId = uuidv7()

  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Test', $3, 'a0')`,
    [workshopId, TENANT, ownerId],
  )
  for (const [id, position] of [
    [dayId, 'a0'],
    [otherDayId, 'a1'],
  ]) {
    await ops.query(
      `insert into workshop_day (id, tenant_id, workshop_id, position) values ($1, $2, $3, $4)`,
      [id, TENANT, workshopId, position],
    )
  }
  await ops.query(
    `insert into cluster (id, tenant_id, workshop_id, day_id, title, position)
     values ($1, $2, $3, $4, 'Sektion', 'a1')`,
    [clusterId, TENANT, workshopId, dayId],
  )

  foreignWorkshopId = uuidv7()
  foreignDayId = uuidv7()
  foreignClusterId = uuidv7()
  foreignModuleId = uuidv7()

  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Fremd', $3, 'a2')`,
    [foreignWorkshopId, TENANT, strangerId],
  )
  await ops.query(
    `insert into workshop_day (id, tenant_id, workshop_id, position) values ($1, $2, $3, 'a0')`,
    [foreignDayId, TENANT, foreignWorkshopId],
  )
  await ops.query(
    `insert into cluster (id, tenant_id, workshop_id, day_id, title, position)
     values ($1, $2, $3, $4, 'Fremde Sektion', 'a0')`,
    [foreignClusterId, TENANT, foreignWorkshopId, foreignDayId],
  )
  await ops.query(
    `insert into module (id, tenant_id, workshop_id, day_id, module_type_id, title, duration_minutes, position, created_by, updated_by)
     values ($1, $2, $3, $4, $5, 'Fremdes Modul', 30, 'a0', $6, $6)`,
    [foreignModuleId, TENANT, foreignWorkshopId, foreignDayId, breakTypeId, strangerId],
  )
})

const shape = async () =>
  withTenant(owner(), async (tx) => {
    const access = await assertWorkshopAccess(tx, owner(), workshopId, 'workshop.read')
    const { doc } = await loadDay(tx, access, dayId, 'de')
    return flattenDay(doc).map((r) => (r.depth === 1 ? `  ${r.id}` : r.id))
  })

/**
 * A block, the way the materialiser leaves one.
 *
 * `position` is given rather than computed: the fractional key is the
 * materialiser's business, and a read test that recomputed it would be agreeing
 * with itself about the order it then asserts.
 */
async function seed(title: string, clusterIdOrNull: string | null, position: string) {
  const id = uuidv7()
  await ops.query(
    `insert into module (id, tenant_id, workshop_id, day_id, cluster_id, module_type_id, title, duration_minutes, position, created_by, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7, 30, $8, $9, $9)`,
    [id, TENANT, workshopId, dayId, clusterIdOrNull, breakTypeId, title, position, ownerId],
  )
  return id
}

describe('reading a day', () => {
  it('puts day-level blocks in position order and projects ordinals', async () => {
    const a = await seed('A', null, 'a2')
    const b = await seed('B', null, 'a3')
    expect(await shape()).toEqual([clusterId, a, b])
  })

  it('nests blocks under the section they belong to', async () => {
    const child = await seed('Kind', clusterId, 'a0')
    expect(await shape()).toEqual([clusterId, `  ${child}`])
  })

  it('interleaves sections and day-level blocks in one key space', async () => {
    // The two tables share one order per parent. A read that sorted each table
    // for itself would put every section before every block, or after -- and
    // the day would silently be a different day than the one people arranged.
    const before = await seed('Vor der Sektion', null, 'a0')
    expect(await shape()).toEqual([before, clusterId])
  })
})

describe('the workshop boundary', () => {
  /**
   * Authorisation happens on the workshop; the read happens on a day id.
   * `assertDayInWorkshop` is what ties the two together, and every caller that
   * takes a day id from outside -- the socket, the MCP tools, the day actions,
   * adopting a catalogue entry -- leans on it.
   *
   * The attacker is an ordinary member who owns a workshop of their own, which
   * every member may create, and who knows a day id from somebody else's. Ids
   * are not secret: a viewer sees them in the page, an export carries them, MCP
   * hands them out. RLS does not help -- both workshops live in the same tenant,
   * which is the normal case and the whole point of a tenant.
   */
  const assertDay = (id: string) =>
    withTenant(owner(), async (tx) => {
      const access = await assertWorkshopAccess(tx, owner(), workshopId, 'workshop.content.write')
      return assertDayInWorkshop(tx, access, id)
    })

  it('passes a day of the workshop that was authorised', async () => {
    await expect(assertDay(dayId)).resolves.toBeUndefined()
  })

  it('refuses a day of another workshop', async () => {
    await expect(assertDay(foreignDayId)).rejects.toThrow(NotFoundError)
  })

  it('refuses a day id that is no day at all', async () => {
    await expect(assertDay(uuidv7())).rejects.toThrow(NotFoundError)
  })

  it('lets the database reject a block whose day belongs to another workshop', async () => {
    // The guard above is the first line; this is the second, and it holds for
    // every path -- including one written next year that forgets the guard.
    await expect(
      ops.query(
        `insert into module (id, tenant_id, workshop_id, day_id, module_type_id, title, duration_minutes, position, created_by, updated_by)
         values ($1, $2, $3, $4, $5, 'Inkonsistent', 30, 'z0', $6, $6)`,
        [uuidv7(), TENANT, workshopId, foreignDayId, breakTypeId, ownerId],
      ),
    ).rejects.toThrow()
  })

  it('lets the database reject a block whose section is on another day', async () => {
    // The composite FK (tenant_id, cluster_id, day_id) makes "a block's section
    // is on the block's own day" a database invariant rather than an
    // application convention.
    await expect(
      ops.query(
        `insert into module (id, tenant_id, workshop_id, day_id, cluster_id, module_type_id, title, duration_minutes, position, created_by, updated_by)
         values ($1, $2, $3, $4, $5, $6, 'Falsche Sektion', 30, 'z0', $7, $7)`,
        [uuidv7(), TENANT, workshopId, otherDayId, clusterId, breakTypeId, ownerId],
      ),
    ).rejects.toThrow()
  })
})

describe('workshop access', () => {
  it('reports not-found for a workshop in another tenant', async () => {
    await expect(
      withTenant(owner(), (tx) => assertWorkshopAccess(tx, owner(), uuidv7(), 'workshop.read')),
    ).rejects.toThrow(NotFoundError)
  })

  it('distinguishes forbidden from not-found for a viewer', async () => {
    const viewerIdentity = randomUUID()
    const viewerId = randomUUID()
    await ops.query('insert into identity (id, email) values ($1, $2)', [
      viewerIdentity,
      `viewer-${viewerIdentity}@example.test`,
    ])
    await ops.query(
      `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
      [viewerId, TENANT, viewerIdentity],
    )
    await ops.query(
      `insert into workshop_collaborator (tenant_id, workshop_id, member_id, role) values ($1, $2, $3, 'viewer')`,
      [TENANT, workshopId, viewerId],
    )

    const viewer: Actor = {
      tenantId: TENANT,
      memberId: viewerId,
      tenantRole: 'member',
      source: 'web',
    }

    // Readable...
    await expect(
      withTenant(viewer, (tx) => assertWorkshopAccess(tx, viewer, workshopId, 'workshop.read')),
    ).resolves.toBeTruthy()

    // ...but not writable, and the distinction is the point: RLS alone would
    // make the workshop simply vanish, and a colleague who shared it would be
    // told "not found".
    await expect(
      withTenant(viewer, (tx) =>
        assertWorkshopAccess(tx, viewer, workshopId, 'workshop.content.write'),
      ),
    ).rejects.toThrow(ForbiddenError)

    await ops.query('delete from workshop_collaborator where member_id = $1', [viewerId])
    await ops.query('delete from identity where id = $1', [viewerIdentity])
  })
})
