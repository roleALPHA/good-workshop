import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { assertWorkshopAccess, NotFoundError } from '@/domain/agenda/access'
import { withTenant, type Actor } from '@/server/db'
import { moveDay } from './days'
import { listDays } from './repo'

/**
 * The order of the days.
 *
 * A table operation, like adding and removing one: the order is not part of
 * any day's document, so no room has to be involved -- and the day tabs, the
 * guest view and list_days all read it from `position`.
 */

const TENANT = '00000000-0000-0000-0000-000000000001'
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

let identityId: string
let memberId: string
let workshopId: string
let days: string[]

const actor = (): Actor => ({ tenantId: TENANT, memberId, tenantRole: 'member', source: 'web' })

beforeAll(async () => {
  await ops.connect()
  identityId = randomUUID()
  memberId = randomUUID()
  await ops.query('insert into identity (id, email) values ($1, $2)', [
    identityId,
    `order-${identityId}@example.test`,
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
    [memberId, TENANT, identityId],
  )
})

afterAll(async () => {
  await ops.query('delete from workshop where owner_id = $1', [memberId])
  await ops.query('delete from identity where id = $1', [identityId])
  await ops.end()
})

beforeEach(async () => {
  workshopId = await workshopWithDays(3)
  days = (await order(workshopId)).map((d) => d.id)
})

async function workshopWithDays(count: number) {
  const id = uuidv7()
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Reihenfolge', $3, 'a0')`,
    [id, TENANT, memberId],
  )
  for (let i = 0; i < count; i++) {
    await ops.query(
      `insert into workshop_day (id, tenant_id, workshop_id, title, position) values ($1, $2, $3, $4, $5)`,
      [uuidv7(), TENANT, id, `Tag ${i + 1}`, `a${i}`],
    )
  }
  return id
}

const order = (id: string) => withTenant(actor(), (tx) => listDays(tx, id))
const titles = async (id: string) => (await order(id)).map((d) => d.title)

const move = (dayId: string, afterId: string | null, expectedVersion?: bigint, id = workshopId) =>
  withTenant(actor(), async (tx) =>
    moveDay(
      tx,
      await assertWorkshopAccess(tx, actor(), id, 'workshop.content.write'),
      dayId,
      afterId,
      expectedVersion,
    ),
  )

describe('moveDay', () => {
  it('puts a day behind the one it is dropped after', async () => {
    await move(days[0]!, days[1]!)
    expect(await titles(workshopId)).toEqual(['Tag 2', 'Tag 1', 'Tag 3'])
  })

  it('puts a day first when there is nothing to put it behind', async () => {
    await move(days[2]!, null)
    expect(await titles(workshopId)).toEqual(['Tag 3', 'Tag 1', 'Tag 2'])
  })

  it('moves a day to the end', async () => {
    await move(days[0]!, days[2]!)
    expect(await titles(workshopId)).toEqual(['Tag 2', 'Tag 3', 'Tag 1'])
  })

  it('refuses a day of another workshop, and an anchor from one', async () => {
    const other = await workshopWithDays(1)
    const [foreign] = (await order(other)).map((d) => d.id)

    await expect(move(foreign!, null)).rejects.toBeInstanceOf(NotFoundError)
    await expect(move(days[0]!, foreign!)).rejects.toBeInstanceOf(NotFoundError)
    expect(await titles(workshopId)).toEqual(['Tag 1', 'Tag 2', 'Tag 3'])
  })

  it('is a change like any other: stale versions are refused, and readers notice', async () => {
    const before = await ops.query('select content_version from workshop where id = $1', [
      workshopId,
    ])
    const version = BigInt(before.rows[0].content_version)

    await expect(move(days[0]!, days[1]!, version - 1n)).rejects.toThrow()
    const after = await move(days[0]!, days[1]!, version)
    expect(after).toBeGreaterThan(version)
  })
})
