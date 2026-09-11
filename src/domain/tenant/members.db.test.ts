import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/server/db'
import {
  MemberError,
  inviteMember,
  listDirectory,
  listMembers,
  setMemberRole,
  setMemberStatus,
} from './members'

/**
 * Membership against a real database.
 *
 * What only a real one can prove: that the e-mail address really does come
 * back from behind the auth-role boundary the application cannot join across,
 * and that the last-admin refusal actually counts rows rather than trusting a
 * value the caller passed in.
 */

/**
 * Its own tenant, not the default one.
 *
 * Half of what is asserted here is about the POPULATION of a tenant -- who the
 * last admin is, who the directory offers. Sharing that population with every
 * other test and with whatever a developer left behind makes those assertions
 * mean nothing.
 */
const TENANT = randomUUID()
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

let adminIdentity: string
let adminMember: string
const created: string[] = []

const admin = (): Actor => ({
  tenantId: TENANT,
  memberId: adminMember,
  tenantRole: 'admin',
  source: 'web',
})
const plain = (): Actor => ({ ...admin(), tenantRole: 'member' })

const address = () => `m-${randomUUID()}@example.test`

beforeAll(async () => {
  await ops.connect()
  await ops.query('insert into tenant (id, slug, name) values ($1, $2, $3)', [
    TENANT,
    `t-${TENANT.slice(0, 8)}`,
    'Mitgliedertest',
  ])

  adminIdentity = randomUUID()
  adminMember = randomUUID()
  created.push(adminIdentity)

  await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
    adminIdentity,
    address(),
    'active',
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'admin', 'active')`,
    [adminMember, TENANT, adminIdentity],
  )
})

afterAll(async () => {
  await ops.query('delete from tenant where id = $1', [TENANT])
  for (const id of created) await ops.query('delete from identity where id = $1', [id])
  await ops.end()
})

/** Remembers what to clean up, so a failing test does not poison the next run. */
async function invite(email: string, role: 'member' | 'admin' = 'member') {
  const result = await inviteMember(admin(), email, role)
  const row = await ops.query('select identity_id from member where id = $1', [result.memberId])
  created.push(row.rows[0].identity_id)
  return result
}

describe('inviteMember', () => {
  it('creates the identity and the membership, and reports the address back', async () => {
    const email = address()
    const result = await invite(email)

    expect(result.alreadyMember).toBe(false)
    const rows = await ops.query('select status, role from member where id = $1', [result.memberId])
    // Invited, not active: an admin who could activate an address they do not
    // control could take over that account by inviting it.
    expect(rows.rows[0]).toMatchObject({ status: 'invited', role: 'member' })
  })

  it('is idempotent for somebody who is already here', async () => {
    const email = address()
    const first = await invite(email)
    const again = await inviteMember(admin(), email, 'admin')

    expect(again.alreadyMember).toBe(true)
    expect(again.memberId).toBe(first.memberId)
    // Deliberately not a promotion: re-inviting must not be a second way to
    // change somebody's role, where the first way has a last-admin guard.
    const rows = await ops.query('select role from member where id = $1', [first.memberId])
    expect(rows.rows[0].role).toBe('member')
  })

  it('refuses an address that is not one', async () => {
    await expect(inviteMember(admin(), 'kein-at-zeichen', 'member')).rejects.toThrow(MemberError)
  })

  it('refuses somebody who is not a tenant admin', async () => {
    await expect(inviteMember(plain(), address(), 'member')).rejects.toThrow('member.adminOnly')
  })
})

describe('listMembers', () => {
  it('carries the e-mail address across the auth-role boundary', async () => {
    const email = address()
    const result = await invite(email)

    const rows = await listMembers(admin())
    const found = rows.find((row) => row.id === result.memberId)
    // The application role cannot read the identity table at all, so this
    // address can only have come from a second query as gw_auth.
    expect(found?.email).toBe(email)
  })

  it('is refused to an ordinary member', async () => {
    await expect(listMembers(plain())).rejects.toThrow('member.adminOnly')
  })
})

describe('listDirectory', () => {
  it('is open to an ordinary member, so they can share their own workshop', async () => {
    const rows = await listDirectory(plain())
    expect(rows.length).toBeGreaterThan(0)
  })

  it('leaves out people who cannot sign in', async () => {
    const result = await invite(address())
    await setMemberStatus(admin(), result.memberId, 'disabled')

    const rows = await listDirectory(plain())
    expect(rows.map((row) => row.id)).not.toContain(result.memberId)
  })
})

describe('the last admin', () => {
  it('cannot be demoted', async () => {
    // Not a matter of taste: a tenant with no admins can only be repaired from
    // a shell on the server.
    await expect(setMemberRole(admin(), adminMember, 'member')).rejects.toThrow('member.lastAdmin')
  })

  it('cannot be switched off', async () => {
    const other = await invite(address())
    await expect(setMemberStatus(admin(), other.memberId, 'disabled')).resolves.toBeUndefined()
    await expect(setMemberStatus(admin(), adminMember, 'disabled')).rejects.toThrow(
      'member.cannotDisableSelf',
    )
  })

  it('may be demoted once somebody else is one', async () => {
    const successor = await invite(address(), 'admin')
    await ops.query(`update member set status = 'active' where id = $1`, [successor.memberId])

    await expect(setMemberRole(admin(), adminMember, 'member')).resolves.toBeUndefined()
    await ops.query(`update member set role = 'admin' where id = $1`, [adminMember])
  })
})
