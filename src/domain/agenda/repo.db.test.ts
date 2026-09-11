import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { withTenant, type Actor } from '@/server/db'
import { assertWorkshopAccess, VersionConflictError, ForbiddenError, NotFoundError } from './access'
import { addModule, deleteModule, loadDay, moveModule, moveCluster } from './repo'
import { flattenDay } from '@/features/agenda/flatten'

/**
 * The repository against a real database.
 *
 * What only a real database can prove: that the day-consistency composite FK
 * actually rejects a module whose cluster lives on another day, and that the
 * WITH CHECK half of the tenant policy actually fires. Both are invariants the
 * application is allowed to rely on, so they had better be true.
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
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Fremd', $3, 'b0')`,
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
    const { doc } = await loadDay(tx, access, dayId)
    return flattenDay(doc).map((r) => (r.depth === 1 ? `  ${r.id}` : r.id))
  })

async function add(title: string, clusterIdOrNull: string | null) {
  return withTenant(owner(), async (tx) => {
    const access = await assertWorkshopAccess(tx, owner(), workshopId, 'workshop.content.write')
    return addModule(tx, access, {
      dayId,
      clusterId: clusterIdOrNull,
      moduleTypeId: breakTypeId,
      title,
    })
  })
}

describe('agenda repository', () => {
  it('appends day-level modules in order and projects ordinals', async () => {
    const a = await add('A', null)
    const b = await add('B', null)
    expect(await shape()).toEqual([clusterId, a.id, b.id])
  })

  it('nests modules under a cluster', async () => {
    const child = await add('Kind', clusterId)
    expect(await shape()).toEqual([clusterId, `  ${child.id}`])
  })

  it('moves a module into a cluster', async () => {
    const m = await add('Wandernd', null)
    await withTenant(owner(), async (tx) => {
      const access = await assertWorkshopAccess(tx, owner(), workshopId, 'workshop.content.write')
      await moveModule(tx, access, m.id, { dayId, clusterId }, null)
    })
    expect(await shape()).toEqual([clusterId, `  ${m.id}`])
  })

  it('moves a module back out onto the day, after an anchor', async () => {
    const first = await add('Erste', null)
    const child = await add('Kind', clusterId)

    await withTenant(owner(), async (tx) => {
      const access = await assertWorkshopAccess(tx, owner(), workshopId, 'workshop.content.write')
      await moveModule(tx, access, child.id, { dayId, clusterId: null }, first.id)
    })

    expect(await shape()).toEqual([clusterId, first.id, child.id])
  })

  it('bumps content_version on every structural change', async () => {
    const before = await withTenant(owner(), (tx) =>
      assertWorkshopAccess(tx, owner(), workshopId, 'workshop.read').then((a) => a.contentVersion),
    )
    await add('Neu', null)
    const after = await withTenant(owner(), (tx) =>
      assertWorkshopAccess(tx, owner(), workshopId, 'workshop.read').then((a) => a.contentVersion),
    )
    expect(after).toBe(before + 1n)
  })

  it('refuses a write against a stale version', async () => {
    const m = await add('X', null)
    await expect(
      withTenant(owner(), async (tx) => {
        const access = await assertWorkshopAccess(tx, owner(), workshopId, 'workshop.content.write')
        // Deliberately one behind: this is the compare-and-swap that stops an
        // MCP client working from a five-minute-old read from clobbering live
        // edits -- reported as "the AI deleted my workshop".
        return moveModule(tx, access, m.id, { dayId, clusterId }, null, access.contentVersion - 1n)
      }),
    ).rejects.toThrow(VersionConflictError)
  })

  it('lets the database reject a cluster on another day', async () => {
    const m = await add('Y', null)
    await expect(
      withTenant(owner(), async (tx) => {
        const access = await assertWorkshopAccess(tx, owner(), workshopId, 'workshop.content.write')
        // The composite FK (tenant_id, cluster_id, day_id) makes "a module's
        // cluster is on the module's own day" a database invariant, not an app
        // convention. This must fail even though the repository does not check.
        return moveModule(tx, access, m.id, { dayId: otherDayId, clusterId }, null)
      }),
    ).rejects.toThrow()
  })

  it('reorders clusters among day-level rows', async () => {
    const m = await add('Tagesebene', null)
    await withTenant(owner(), async (tx) => {
      const access = await assertWorkshopAccess(tx, owner(), workshopId, 'workshop.content.write')
      await moveCluster(tx, access, clusterId, dayId, m.id)
    })
    expect(await shape()).toEqual([m.id, clusterId])
  })
})

describe('the workshop boundary', () => {
  /**
   * Authorisation happens on the workshop; the write happens on an id. Nothing
   * in between checks that the id belongs to the workshop that was authorised.
   *
   * The attacker here is an ordinary member who owns a workshop of their own --
   * which every member may create -- and who knows an id from somebody else's.
   * Ids are not secret: a viewer sees them in the page, an export carries them,
   * MCP hands them out.
   *
   * RLS does not help. Both workshops live in the same tenant, which is the
   * normal case and the whole point of a tenant.
   */
  const asAttacker = <T>(fn: (tx: never, access: never) => Promise<T>) =>
    withTenant(owner(), async (tx) => {
      const access = await assertWorkshopAccess(tx, owner(), workshopId, 'workshop.content.write')
      return fn(tx as never, access as never)
    })

  const foreignModuleStillThere = async () => {
    const { rows } = await ops.query('select title, day_id from module where id = $1', [
      foreignModuleId,
    ])
    return rows[0]
  }

  it('refuses to delete a module that belongs to another workshop', async () => {
    await expect(
      asAttacker((tx, access) => deleteModule(tx, access, foreignModuleId)),
    ).rejects.toThrow()

    expect(await foreignModuleStillThere()).toMatchObject({ title: 'Fremdes Modul' })
  })

  it('refuses to move a module that belongs to another workshop', async () => {
    // The theft variant: the foreign module is dragged onto a day of the
    // attacker's own workshop, where loadDay -- which selects by day_id -- will
    // happily show it to them.
    await expect(
      asAttacker((tx, access) =>
        moveModule(tx, access, foreignModuleId, { dayId, clusterId: null }, null),
      ),
    ).rejects.toThrow()

    expect(await foreignModuleStillThere()).toMatchObject({ day_id: foreignDayId })
  })

  it('refuses to move a cluster that belongs to another workshop', async () => {
    await expect(
      asAttacker((tx, access) => moveCluster(tx, access, foreignClusterId, dayId, null)),
    ).rejects.toThrow()

    const { rows } = await ops.query('select day_id from cluster where id = $1', [foreignClusterId])
    expect(rows[0]).toMatchObject({ day_id: foreignDayId })
  })

  it('refuses to add a module to a day in another workshop', async () => {
    await expect(
      asAttacker((tx, access) =>
        addModule(tx, access, {
          dayId: foreignDayId,
          clusterId: null,
          moduleTypeId: breakTypeId,
          title: 'Untergeschoben',
        }),
      ),
    ).rejects.toThrow()

    const { rows } = await ops.query('select count(*)::int as n from module where day_id = $1', [
      foreignDayId,
    ])
    expect(rows[0].n).toBe(1)
  })

  it('lets the database reject a module whose day belongs to another workshop', async () => {
    // The application check above is the first line; this is the second. The
    // comment above moveModule claims the database already does this -- it does
    // so for cluster/day, never for workshop/day. Until this passes, the
    // repository is the only thing standing between a stray id and the data.
    await expect(
      ops.query(
        `insert into module (id, tenant_id, workshop_id, day_id, module_type_id, title, duration_minutes, position, created_by, updated_by)
         values ($1, $2, $3, $4, $5, 'Inkonsistent', 30, 'z0', $6, $6)`,
        [uuidv7(), TENANT, workshopId, foreignDayId, breakTypeId, ownerId],
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
