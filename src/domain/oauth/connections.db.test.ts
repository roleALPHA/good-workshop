import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { withTenant, withoutTenant, type Actor } from '@/server/db'
import { hashSecret, parseOAuthToken } from '@/server/auth/tokens'
import { issueTokens, registerClient } from './repo'
import { listConnections, revokeConnection } from './connections'

/**
 * The clients somebody has connected over OAuth, and taking that back.
 *
 * The consent screen has always said access can be withdrawn under AI
 * Connection, and until these existed it could not: the only way out was to
 * disconnect in the client and trust it to forget its token.
 */

const TENANT = randomUUID()
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })
const RESOURCE = 'https://gw.test/api/mcp'

let me: string
let colleague: string
const identities: string[] = []

const as = (memberId: string): Actor => ({
  tenantId: TENANT,
  memberId,
  tenantRole: 'member',
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

const register = (name: string) =>
  withTenant(as(me), (tx) =>
    registerClient(tx, { name, redirectUris: ['https://client.test/cb'], confidential: false }),
  )

const connect = (memberId: string, clientId: string) =>
  withTenant(as(memberId), (tx) =>
    issueTokens(tx, {
      clientId,
      memberId,
      scopes: ['workshops:read', 'workshops:write'],
      resource: RESOURCE,
      withRefresh: true,
    }),
  )

const stillWorks = async (accessToken: string) => {
  const parsed = parseOAuthToken(accessToken)!
  const rows = await withoutTenant((tx) =>
    tx.execute(
      sql`select tenant_id from app.resolve_oauth_token(${parsed.tokenKey}, ${hashSecret(parsed.secret)})`,
    ),
  )
  return rows.rows.length === 1
}

beforeAll(async () => {
  await ops.connect()
  await ops.query('insert into tenant (id, slug, name) values ($1, $2, $3)', [
    TENANT,
    `t-${TENANT.slice(0, 8)}`,
    'Verbindungen',
  ])
  me = await makeMember()
  colleague = await makeMember()
})

afterAll(async () => {
  await ops.query('delete from tenant where id = $1', [TENANT])
  for (const id of identities) await ops.query('delete from identity where id = $1', [id])
  await ops.end()
})

beforeEach(async () => {
  await ops.query('delete from oauth_client where tenant_id = $1', [TENANT])
})

describe('connected clients', () => {
  it('lists each client once, with what it may do, and only my own', async () => {
    const claude = await register('Claude')
    const other = await register('Anderer Client')
    await connect(me, claude.id)
    await connect(me, claude.id) // connected twice: still one entry
    await connect(colleague, other.id)

    const mine = await withTenant(as(me), (tx) => listConnections(tx, as(me)))
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ clientId: claude.id, name: 'Claude' })
    expect(mine[0]!.scopes.sort()).toEqual(['workshops:read', 'workshops:write'])
    expect(mine[0]!.connectedAt).toBeInstanceOf(Date)
  })

  it('ends a connection at once: its access tokens stop working and its refresh tokens too', async () => {
    const claude = await register('Claude')
    const issued = await connect(me, claude.id)
    expect(await stillWorks(issued.accessToken)).toBe(true)

    const count = await withTenant(as(me), (tx) => revokeConnection(tx, as(me), claude.id))
    expect(count).toBe(2) // one access, one refresh

    expect(await stillWorks(issued.accessToken)).toBe(false)
    const { rows } = await ops.query(
      `select count(*)::int as n from oauth_token where client_id = $1 and revoked_at is null`,
      [claude.id],
    )
    expect(rows[0].n).toBe(0)
    expect(await withTenant(as(me), (tx) => listConnections(tx, as(me)))).toEqual([])
  })

  it('cannot end a colleague’s connection to the same client', async () => {
    const claude = await register('Claude')
    const theirs = await connect(colleague, claude.id)

    const count = await withTenant(as(me), (tx) => revokeConnection(tx, as(me), claude.id))
    expect(count).toBe(0)
    expect(await stillWorks(theirs.accessToken)).toBe(true)
  })
})
