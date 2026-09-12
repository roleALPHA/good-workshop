import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import pg from 'pg'
import { claimInstallation, currentSetupToken, needsSetup, SetupError } from './setup'
import { authConfig } from '@/server/auth/config'

/**
 * Claiming an installation, against a real database.
 *
 * The properties here are the ones that decide whether a deployment reachable
 * from the internet can be taken over by whoever loads it first: that the key is
 * required, that a second claim is refused, and that the route closes once
 * somebody owns the installation.
 */

const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })
const TENANT = authConfig.defaultTenantId

beforeAll(async () => {
  await ops.connect()
})

afterAll(async () => {
  await restore()
  await ops.end()
})

/**
 * The precondition is "no active admin", and producing it must not destroy
 * anybody else's data.
 *
 * An earlier version simply deleted every member of the tenant. Against a
 * development database that throws away the developer's own membership, and
 * against a database that has workshops it fails outright on the foreign key
 * from workshop.owner_id -- which is how the flaw surfaced.
 *
 * So foreign members are demoted for the duration and put back afterwards,
 * and only the identities this file creates are removed.
 */
const suspended: string[] = []

const reset = async () => {
  const { rows } = await ops.query(
    `update member set role = 'member'
      where tenant_id = $1 and role = 'admin' and status = 'active'
        and identity_id not in (select id from identity where email like 'setup-%@example.test')
      returning id`,
    [TENANT],
  )
  suspended.push(...rows.map((r) => r.id))

  await ops.query(
    `delete from member
      where tenant_id = $1
        and identity_id in (select id from identity where email like 'setup-%@example.test')`,
    [TENANT],
  )
  await ops.query(`delete from identity where email like 'setup-%@example.test'`)
}

const restore = async () => {
  if (suspended.length === 0) return
  await ops.query(`update member set role = 'admin' where id = any($1::uuid[])`, [suspended])
  suspended.length = 0
}

beforeEach(reset)
afterEach(reset)

describe('a fresh installation', () => {
  it('reports that it needs setting up while it has no active admin', async () => {
    expect(await needsSetup()).toBe(true)
  })

  it('refuses a wrong key before looking at anything else', async () => {
    await expect(claimInstallation('setup-a@example.test', 'falsch')).rejects.toThrow(SetupError)
    expect(await needsSetup()).toBe(true)
  })

  it('refuses an address that is not one', async () => {
    await expect(claimInstallation('kein-email', currentSetupToken())).rejects.toThrow(
      'setup.invalidEmail',
    )
  })

  it('makes the first caller an admin and then closes', async () => {
    const email = await claimInstallation('setup-b@example.test', currentSetupToken())
    expect(email).toBe('setup-b@example.test')

    const { rows } = await ops.query(
      `select m.role, m.status from member m
         join identity i on i.id = m.identity_id
        where i.email = $1 and m.tenant_id = $2`,
      ['setup-b@example.test', TENANT],
    )
    expect(rows[0]).toMatchObject({ role: 'admin', status: 'active' })

    // The whole point: no second claim, and the page is gone.
    expect(await needsSetup()).toBe(false)
    await expect(claimInstallation('setup-c@example.test', currentSetupToken())).rejects.toThrow(
      'setup.alreadyClaimed',
    )
  })

  it('normalises the address, so Setup-B and setup-b are one account', async () => {
    await claimInstallation('  Setup-B@Example.Test  ', currentSetupToken())
    const { rows } = await ops.query(`select email from identity where email = $1`, [
      'setup-b@example.test',
    ])
    expect(rows).toHaveLength(1)
  })

  it('adopts an identity that already exists instead of failing on the unique index', async () => {
    await ops.query(`insert into identity (id, email) values (gen_random_uuid(), $1)`, [
      'setup-d@example.test',
    ])

    await claimInstallation('setup-d@example.test', currentSetupToken())
    expect(await needsSetup()).toBe(false)
  })
})
