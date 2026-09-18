import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { sql } from 'drizzle-orm'
import { uuidv7 } from 'uuidv7'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withTenant, type Actor } from '@/server/db'
import { assertWorkshopAccess, ForbiddenError } from '@/domain/agenda/access'
import { findClient, registerClient } from '@/domain/oauth/repo'
import { setOwnName } from '@/domain/tenant/members'
import { edition } from '@/server/edition'
import { CLIENT_REGISTRY_TENANT } from './cloud'

/**
 * A tenant's state in the cloud: read only when it may not change anything, and
 * OAuth clients brought over from the registry when somebody consents.
 */

const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })
const A = randomUUID()
const B = randomUUID()
const identities: string[] = []

async function admin(tenantId: string): Promise<Actor> {
  const identityId = randomUUID()
  const memberId = randomUUID()
  identities.push(identityId)
  await ops.query(`insert into identity (id, email, status) values ($1, $2, 'active')`, [
    identityId,
    `status-${identityId}@example.test`,
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'admin', 'active')`,
    [memberId, tenantId, identityId],
  )
  return { tenantId, memberId, tenantRole: 'admin', source: 'web' }
}

async function workshopOf(actor: Actor): Promise<string> {
  const id = uuidv7()
  await ops.query(
    `insert into workshop (id, tenant_id, title, owner_id, position) values ($1, $2, 'Status', $3, 'a0')`,
    [id, actor.tenantId, actor.memberId],
  )
  return id
}

const setState = (tenantId: string, state: 'trial' | 'active' | 'read_only') =>
  ops.query(
    `insert into tenant_lifecycle (tenant_id, state) values ($1, $2)
     on conflict (tenant_id) do update set state = excluded.state, updated_at = now()`,
    [tenantId, state],
  )

let inA: Actor
let inB: Actor

beforeAll(async () => {
  await ops.connect()
  for (const id of [A, B]) {
    await ops.query(`insert into tenant (id, slug, name) values ($1, $2, 'Statustest')`, [
      id,
      `status-${id.slice(0, 8)}`,
    ])
  }
  inA = await admin(A)
  inB = await admin(B)
})

afterAll(async () => {
  await ops.query('delete from tenant where id = any($1::uuid[])', [[A, B]])
  await ops.query('delete from identity where id = any($1::uuid[])', [identities])
  await ops.end()
})

describe('a read-only tenant', () => {
  it('keeps reading and exporting, and loses every write capability', async () => {
    const workshopId = await workshopOf(inB)
    await setState(B, 'read_only')
    try {
      const access = await withTenant(inB, (tx) =>
        assertWorkshopAccess(tx, inB, workshopId, 'workshop.read'),
      )
      expect(access.can('workshop.export')).toBe(true)
      expect(access.can('workshop.content.write')).toBe(false)
      await expect(
        withTenant(inB, (tx) => assertWorkshopAccess(tx, inB, workshopId, 'workshop.update')),
      ).rejects.toThrow(ForbiddenError)
    } finally {
      await setState(B, 'active')
    }
  })

  it('is refused by the database, whatever path the write takes', async () => {
    const workshopId = await workshopOf(inB)
    await setState(B, 'read_only')
    try {
      // A new row is refused outright ...
      const refused = await withTenant(inB, (tx) =>
        tx.execute(
          sql`insert into tag (id, tenant_id, name) values (${randomUUID()}, ${B}, 'neu')`,
        ),
      ).catch((error: Error) => error)
      expect((refused as Error).cause).toMatchObject({ code: '42501' })
      // ... and an existing one is simply out of reach for an update or a delete.
      await withTenant(inB, async (tx) => {
        await tx.execute(sql`update workshop set title = 'geändert' where id = ${workshopId}`)
        await tx.execute(sql`delete from workshop where id = ${workshopId}`)
      })
      const rows = await ops.query('select title from workshop where id = $1', [workshopId])
      expect(rows.rows[0].title).toBe('Status')
    } finally {
      await setState(B, 'active')
    }
  })

  it('does not reach into another tenant', async () => {
    const workshopInA = await workshopOf(inA)
    await setState(B, 'read_only')
    try {
      const access = await withTenant(inA, (tx) =>
        assertWorkshopAccess(tx, inA, workshopInA, 'workshop.update'),
      )
      expect(access.can('workshop.content.write')).toBe(true)
    } finally {
      await setState(B, 'active')
    }
  })

  it('still lets people sign in and fix their own name', async () => {
    await setState(B, 'read_only')
    try {
      await setOwnName(inB, { firstName: 'Lese', lastName: 'Modus' })
      expect(await withTenant(inB, (tx) => edition.tenantWritable(tx))).toBe(false)
    } finally {
      await setState(B, 'active')
    }
  })

  it('writes again once the state changes, and a trial is writable', async () => {
    await setState(B, 'trial')
    expect(await withTenant(inB, (tx) => edition.tenantWritable(tx))).toBe(true)
  })

  /**
   * The list in drizzle-cloud/sql/951_read_only.sql is explicit, so a table
   * added to the community schema next year is not silently writable in a
   * read-only tenant. Every tenant table is either guarded there or named here
   * with the reason it is not.
   */
  it('has decided about every tenant table', async () => {
    const notGuarded: Record<string, string> = {
      audit_event: 'records what happened, including reads and sign-ins',
      collab_state: 'the room writes it when a day is merely opened',
      collab_update: 'the same, for the update log',
      member: 'activating an invitation and correcting a name must keep working',
      module_type: 'provisioning updates the built-in block types for every tenant on boot',
      module_type_version: 'the same, for their versions',
      oauth_client: 'adopting a client at consent, so a connector can still read',
      oauth_grant: 'spending an authorization code, the same',
      oauth_token: 'rotating a refresh token, the same',
      personal_access_token: 'recording last use, so a token can still read',
      share_session: 'a guest signing in to read',
    }
    const { rows } = await ops.query(`
      select c.relname as table,
             exists (select 1 from pg_policy p
                     where p.polrelid = c.oid and p.polname = 'cloud_read_only_update') as guarded
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
        and exists (select 1 from information_schema.columns col
                    where col.table_schema = 'public' and col.table_name = c.relname
                      and col.column_name = 'tenant_id')
        -- The cloud's own bookkeeping, which the application never writes.
        and c.relname not in ('tenant_lifecycle', 'billing_account', 'vat_check', 'tax_evidence',
                              'usage_member_interval', 'usage_workshop_created', 'billing_period',
                              'operator_audit', 'invoice_document')
    `)
    const undecided = rows
      .filter((row) => !row.guarded && !(row.table in notGuarded))
      .map((row) => row.table)
    expect(undecided).toEqual([])
  })
})

describe('an OAuth client registered before anybody signed in', () => {
  it('is brought into the tenant of the person consenting, and only there', async () => {
    const registryActor: Actor = {
      tenantId: CLIENT_REGISTRY_TENANT,
      memberId: null,
      tenantRole: 'member',
      source: 'mcp',
    }
    const client = await withTenant(registryActor, (tx) =>
      registerClient(tx, {
        name: 'Registry client',
        redirectUris: ['https://registry.example.test/callback'],
        confidential: false,
      }),
    )

    expect(await withTenant(inB, (tx) => findClient(tx, client.clientKey))).toBeNull()

    const adopted = await withTenant(inB, async (tx) => {
      await edition.adoptRegisteredClient(tx, client.clientKey)
      // Twice, as a reload of the consent screen would.
      await edition.adoptRegisteredClient(tx, client.clientKey)
      return findClient(tx, client.clientKey)
    })
    expect(adopted).toMatchObject({ name: 'Registry client' })

    expect(await withTenant(inA, (tx) => findClient(tx, client.clientKey))).toBeNull()
    const copies = await ops.query('select tenant_id from oauth_client where client_key = $1', [
      client.clientKey,
    ])
    expect(copies.rows.map((row) => row.tenant_id).sort()).toEqual(
      [CLIENT_REGISTRY_TENANT, B].sort(),
    )

    await ops.query('delete from oauth_client where client_key = $1', [client.clientKey])
  })

  it('cannot be adopted into the registry itself', async () => {
    const registryActor: Actor = {
      tenantId: CLIENT_REGISTRY_TENANT,
      memberId: null,
      tenantRole: 'member',
      source: 'mcp',
    }
    await expect(
      withTenant(registryActor, (tx) => edition.adoptRegisteredClient(tx, 'unknown')),
    ).resolves.toBeUndefined()
  })
})
