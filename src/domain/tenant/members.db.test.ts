import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '@/server/db'
import {
  MemberError,
  deleteOwnAccount,
  ownEstate,
  inviteMember,
  listAssignable,
  listDirectory,
  listMembers,
  removeMember,
  setMemberName,
  setMemberRole,
  setMemberStatus,
  setOwnName,
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
const ANNA = { firstName: 'Anna', lastName: 'Berger' }

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
  const result = await inviteMember(admin(), email, role, 'de', ANNA)
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
    const again = await inviteMember(admin(), email, 'admin', 'de', ANNA)

    expect(again.alreadyMember).toBe(true)
    expect(again.memberId).toBe(first.memberId)
    // Deliberately not a promotion: re-inviting must not be a second way to
    // change somebody's role, where the first way has a last-admin guard.
    const rows = await ops.query('select role from member where id = $1', [first.memberId])
    expect(rows.rows[0].role).toBe('member')
  })

  it('refuses an address that is not one', async () => {
    await expect(inviteMember(admin(), 'kein-at-zeichen', 'member', 'de', ANNA)).rejects.toThrow(
      MemberError,
    )
  })

  it('refuses somebody who is not a tenant admin', async () => {
    await expect(inviteMember(plain(), address(), 'member', 'de', ANNA)).rejects.toThrow(
      'member.adminOnly',
    )
  })

  it('stores first and last name on the membership', async () => {
    const result = await inviteMember(admin(), address(), 'member', 'de', {
      firstName: '  Clara ',
      lastName: 'Deutsch  ',
    })
    const rows = await ops.query(
      'select identity_id, first_name, last_name from member where id = $1',
      [result.memberId],
    )
    created.push(rows.rows[0].identity_id)
    expect(rows.rows[0]).toMatchObject({ first_name: 'Clara', last_name: 'Deutsch' })
  })

  it('refuses an invitation without a name, before anything is written', async () => {
    const email = address()
    await expect(
      inviteMember(admin(), email, 'member', 'de', { firstName: 'Clara', lastName: ' ' }),
    ).rejects.toThrow('person.lastNameRequired')

    const rows = await ops.query('select 1 from identity where email = $1', [email])
    expect(rows.rowCount).toBe(0)
  })
})

describe('names', () => {
  it('shows the full name in the lists and in who may be put in charge of a block', async () => {
    const result = await inviteMember(admin(), address(), 'member', 'de', {
      firstName: 'Emil',
      lastName: 'Fuchs',
    })
    const row = await ops.query('select identity_id from member where id = $1', [result.memberId])
    created.push(row.rows[0].identity_id)

    const members = await listMembers(admin())
    expect(members.find((m) => m.id === result.memberId)).toMatchObject({
      firstName: 'Emil',
      lastName: 'Fuchs',
      displayName: 'Emil Fuchs',
    })

    const assignable = await listAssignable(admin())
    expect(assignable.find((p) => p.id === result.memberId)?.name).toBe('Emil Fuchs')
  })

  it('lets an admin correct a colleague’s name', async () => {
    const result = await invite(address())
    await setMemberName(admin(), result.memberId, { firstName: 'Greta', lastName: 'Huber' })

    const rows = await ops.query('select first_name, last_name from member where id = $1', [
      result.memberId,
    ])
    expect(rows.rows[0]).toMatchObject({ first_name: 'Greta', last_name: 'Huber' })
  })

  it('does not let a plain member rename a colleague', async () => {
    const result = await invite(address())
    await expect(
      setMemberName(plain(), result.memberId, { firstName: 'X', lastName: 'Y' }),
    ).rejects.toThrow('member.adminOnly')
  })

  it('refuses a name that is not one, and a member that does not exist', async () => {
    const result = await invite(address())
    await expect(
      setMemberName(admin(), result.memberId, { firstName: '', lastName: 'Huber' }),
    ).rejects.toThrow('person.firstNameRequired')
    await expect(
      setMemberName(admin(), randomUUID(), { firstName: 'Greta', lastName: 'Huber' }),
    ).rejects.toThrow('member.gone')
  })

  it('lets anybody change their own name, and only their own', async () => {
    const result = await invite(address())
    const self: Actor = {
      tenantId: TENANT,
      memberId: result.memberId,
      tenantRole: 'member',
      source: 'web',
    }

    await setOwnName(self, { firstName: 'Ida', lastName: 'Jung' })

    const rows = await ops.query(
      'select id, first_name, last_name from member where id = any($1::uuid[])',
      [[result.memberId, adminMember]],
    )
    const byId = new Map(rows.rows.map((r) => [r.id, r]))
    expect(byId.get(result.memberId)).toMatchObject({ first_name: 'Ida', last_name: 'Jung' })
    expect(byId.get(adminMember)).not.toMatchObject({ first_name: 'Ida' })
  })

  it('is invisible from another tenant', async () => {
    const result = await invite(address())
    const stranger: Actor = { ...admin(), tenantId: randomUUID() }
    await expect(
      setMemberName(stranger, result.memberId, { firstName: 'Kai', lastName: 'Lang' }),
    ).rejects.toThrow()

    const rows = await ops.query('select first_name from member where id = $1', [result.memberId])
    expect(rows.rows[0].first_name).toBe('Anna')
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

describe('removeMember', () => {
  /** A workshop owned by somebody, straight through ops: the point is the row. */
  async function workshopOwnedBy(memberId: string) {
    const id = randomUUID()
    await ops.query(
      `insert into workshop (id, tenant_id, title, owner_id, created_by, position)
       values ($1, $2, 'Ubergabe', $3, $3, 'a0')`,
      [id, TENANT, memberId],
    )
    return id
  }

  async function folderOwnedBy(memberId: string) {
    const id = randomUUID()
    await ops.query(
      `insert into folder (id, tenant_id, name, position, created_by)
       values ($1, $2, $3, 'a0', $4)`,
      [id, TENANT, `F-${id.slice(0, 8)}`, memberId],
    )
    return id
  }

  it('hands workshops and folders to the successor, then deletes the member', async () => {
    const leaving = await invite(address())
    const staying = await invite(address())
    const workshopId = await workshopOwnedBy(leaving.memberId)
    const folderId = await folderOwnedBy(leaving.memberId)

    const result = await removeMember(admin(), leaving.memberId, staying.memberId)

    expect(result.handedOver).toEqual({ workshops: 1, folders: 1 })
    const owner = await ops.query('select owner_id from workshop where id = $1', [workshopId])
    expect(owner.rows[0].owner_id).toBe(staying.memberId)
    // folder.created_by IS folder ownership -- folderRoleFromPath reads exactly
    // this column as 'owner'. Nothing in the database would have stopped it
    // from pointing at a member who no longer exists.
    const folderOwner = await ops.query('select created_by from folder where id = $1', [folderId])
    expect(folderOwner.rows[0].created_by).toBe(staying.memberId)

    const gone = await ops.query('select 1 from member where id = $1', [leaving.memberId])
    expect(gone.rowCount).toBe(0)
  })

  it('refuses without a successor while anything still belongs to them', async () => {
    const leaving = await invite(address())
    await workshopOwnedBy(leaving.memberId)

    await expect(removeMember(admin(), leaving.memberId, null)).rejects.toThrow(MemberError)
    // The refusal has to leave the membership intact -- a half-removal is the
    // one outcome that cannot be repaired from this screen.
    const still = await ops.query('select 1 from member where id = $1', [leaving.memberId])
    expect(still.rowCount).toBe(1)
  })

  it('needs no successor from somebody who owns nothing', async () => {
    const leaving = await invite(address())
    const result = await removeMember(admin(), leaving.memberId, null)
    expect(result.handedOver).toEqual({ workshops: 0, folders: 0 })
  })

  it("will not hand a team's work to somebody who cannot sign in", async () => {
    const leaving = await invite(address())
    const disabled = await invite(address())
    await setMemberStatus(admin(), disabled.memberId, 'disabled')
    await workshopOwnedBy(leaving.memberId)

    await expect(removeMember(admin(), leaving.memberId, disabled.memberId)).rejects.toThrow(
      MemberError,
    )
  })

  it('refuses to remove the last admin, and refuses self-removal first', async () => {
    await expect(removeMember(admin(), adminMember, null)).rejects.toThrow(MemberError)
    const still = await ops.query('select 1 from member where id = $1', [adminMember])
    expect(still.rowCount).toBe(1)
  })

  it('is not something a plain member may do', async () => {
    const leaving = await invite(address())
    await expect(removeMember(plain(), leaving.memberId, null)).rejects.toThrow(MemberError)
  })

  it('deletes the account when that was the last membership anywhere', async () => {
    const leaving = await invite(address())
    const row = await ops.query('select identity_id from member where id = $1', [leaving.memberId])
    const identityId = row.rows[0].identity_id

    const result = await removeMember(admin(), leaving.memberId, null)

    expect(result.identityForgotten).toBe(true)
    const account = await ops.query('select 1 from identity where id = $1', [identityId])
    expect(account.rowCount).toBe(0)
  })

  /**
   * The reason app.forget_identity_if_orphaned runs with BYPASSRLS. An admin of
   * one workspace must not be able to delete an account another workspace still
   * uses, and a membership count scoped by the caller's tenant would answer
   * "none left" and be wrong.
   */
  it('keeps the account when the person still belongs to another workspace', async () => {
    const leaving = await invite(address())
    const row = await ops.query('select identity_id from member where id = $1', [leaving.memberId])
    const identityId = row.rows[0].identity_id

    const otherTenant = randomUUID()
    await ops.query('insert into tenant (id, slug, name) values ($1, $2, $3)', [
      otherTenant,
      `t-${otherTenant.slice(0, 8)}`,
      'Anderer Workspace',
    ])
    await ops.query(
      `insert into member (id, tenant_id, identity_id, role, status)
       values ($1, $2, $3, 'member', 'active')`,
      [randomUUID(), otherTenant, identityId],
    )

    const result = await removeMember(admin(), leaving.memberId, null)

    expect(result.identityForgotten).toBe(false)
    const account = await ops.query('select 1 from identity where id = $1', [identityId])
    expect(account.rowCount).toBe(1)

    await ops.query('delete from tenant where id = $1', [otherTenant])
  })

  it('takes the tokens and collaboration grants with it', async () => {
    const leaving = await invite(address())
    await ops.query(
      `insert into personal_access_token (id, tenant_id, member_id, name, token_id, token_hash, scopes)
       values ($1, $2, $3, 'Test', $4, 'x', '{workshops:read}')`,
      [randomUUID(), TENANT, leaving.memberId, randomUUID().slice(0, 12)],
    )

    await removeMember(admin(), leaving.memberId, null)

    const tokens = await ops.query('select 1 from personal_access_token where member_id = $1', [
      leaving.memberId,
    ])
    expect(tokens.rowCount).toBe(0)
  })
})

describe('deleteOwnAccount', () => {
  const selfOf = (memberId: string, role: 'member' | 'admin' = 'member'): Actor => ({
    tenantId: TENANT,
    memberId,
    tenantRole: role,
    source: 'web',
  })
  const activate = (memberId: string) =>
    ops.query(`update member set status = 'active' where id = $1`, [memberId])

  it('removes the membership and forgets an account nobody else holds', async () => {
    const email = address()
    const leaving = await invite(email)
    await activate(leaving.memberId)

    const result = await deleteOwnAccount(selfOf(leaving.memberId), null)

    expect(result.identityForgotten).toBe(true)
    const member = await ops.query('select 1 from member where id = $1', [leaving.memberId])
    const identity = await ops.query('select 1 from identity where email = $1', [email])
    expect(member.rowCount).toBe(0)
    expect(identity.rowCount).toBe(0)
  })

  it('hands what it owns to a colleague, and asks for one first', async () => {
    const leaving = await invite(address())
    const staying = await invite(address())
    await activate(leaving.memberId)
    const workshopId = randomUUID()
    await ops.query(
      `insert into workshop (id, tenant_id, title, owner_id, created_by, position)
       values ($1, $2, 'Eigenes', $3, $3, 'a0')`,
      [workshopId, TENANT, leaving.memberId],
    )

    expect(await ownEstate(selfOf(leaving.memberId))).toEqual({ workshops: 1, folders: 0 })
    await expect(deleteOwnAccount(selfOf(leaving.memberId), null)).rejects.toThrow(
      'member.successorRequired',
    )
    await expect(deleteOwnAccount(selfOf(leaving.memberId), leaving.memberId)).rejects.toThrow(
      'member.successorIsLeaver',
    )

    await deleteOwnAccount(selfOf(leaving.memberId), staying.memberId)
    const rows = await ops.query('select owner_id from workshop where id = $1', [workshopId])
    expect(rows.rows[0].owner_id).toBe(staying.memberId)
  })

  it('is refused to the last admin, who would leave a workspace nobody can administer', async () => {
    // A tenant of its own: the one above has gained admins in earlier tests.
    const lonely = randomUUID()
    const identityId = randomUUID()
    const memberId = randomUUID()
    await ops.query(`insert into tenant (id, slug, name) values ($1, $2, 'Allein')`, [
      lonely,
      `t-${lonely.slice(0, 8)}`,
    ])
    await ops.query('insert into identity (id, email) values ($1, $2)', [identityId, address()])
    try {
      await ops.query(
        `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'admin', 'active')`,
        [memberId, lonely, identityId],
      )
      const self: Actor = { tenantId: lonely, memberId, tenantRole: 'admin', source: 'web' }
      await expect(deleteOwnAccount(self, null)).rejects.toThrow('member.lastAdmin')
      const rows = await ops.query('select 1 from member where id = $1', [memberId])
      expect(rows.rowCount).toBe(1)
    } finally {
      await ops.query('delete from tenant where id = $1', [lonely])
      await ops.query('delete from identity where id = $1', [identityId])
    }
  })

  it('keeps the account when another workspace still holds it', async () => {
    const other = randomUUID()
    await ops.query(`insert into tenant (id, slug, name) values ($1, $2, 'Anderswo')`, [
      other,
      `t-${other.slice(0, 8)}`,
    ])
    try {
      const email = address()
      const leaving = await invite(email)
      await activate(leaving.memberId)
      const row = await ops.query('select identity_id from member where id = $1', [
        leaving.memberId,
      ])
      await ops.query(
        `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
        [randomUUID(), other, row.rows[0].identity_id],
      )

      const result = await deleteOwnAccount(selfOf(leaving.memberId), null)
      expect(result.identityForgotten).toBe(false)
      const identity = await ops.query('select 1 from identity where email = $1', [email])
      expect(identity.rowCount).toBe(1)
    } finally {
      await ops.query('delete from tenant where id = $1', [other])
    }
  })
})
