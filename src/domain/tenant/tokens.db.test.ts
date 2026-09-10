import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { withTenant, type Actor } from '@/server/db'
import { resolveBearer } from '@/server/mcp/auth'
import { TokenError, createToken, listTokens, revokeToken } from './tokens'

/**
 * Tokens against a real database.
 *
 * The assertion that matters is the round trip: a token made here has to be
 * one the MCP endpoint accepts, and a revoked one has to stop being accepted
 * immediately. Anything less and the screen is a decoration over a credential
 * system nobody checked.
 */

const TENANT = randomUUID()
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

let mine: string
let theirs: string
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
    `tok-${identityId}@example.test`,
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
    'Tokentest',
  ])
  mine = await makeMember()
  theirs = await makeMember()
})

afterAll(async () => {
  await ops.query('delete from tenant where id = $1', [TENANT])
  for (const id of identities) await ops.query('delete from identity where id = $1', [id])
  await ops.end()
})

const create = (actor: Actor, name: string, scopes: string[]) =>
  withTenant(actor, (tx) => createToken(tx, actor, { name, scopes }))

describe('createToken', () => {
  it('produces a token the MCP endpoint accepts, as the member who made it', async () => {
    const { token } = await create(as(mine), 'Claude', ['workshops:read', 'workshops:write'])

    const resolved = await resolveBearer(`Bearer ${token}`)
    expect(resolved?.memberId).toBe(mine)
    expect(resolved?.tenantId).toBe(TENANT)
    expect(resolved?.scopes.sort()).toEqual(['workshops:read', 'workshops:write'])
  })

  it('stores only a hash', async () => {
    const { token, row } = await create(as(mine), 'Nur Hash', ['workshops:read'])
    const stored = await ops.query('select token_hash from personal_access_token where id = $1', [
      row.id,
    ])
    // A stolen dump must yield no working tokens.
    expect(stored.rows[0].token_hash).not.toContain(token.split('_')[2])
  })

  it('refuses a token with no scopes, which could do nothing anyway', async () => {
    await expect(create(as(mine), 'Leer', [])).rejects.toThrow(TokenError)
  })

  it('refuses a scope that does not exist', async () => {
    await expect(create(as(mine), 'Erfunden', ['members:write'])).rejects.toThrow(/Unbekannte/)
  })

  it('insists on a name, so it can be recognised later', async () => {
    await expect(create(as(mine), '   ', ['workshops:read'])).rejects.toThrow(/Namen/)
  })
})

describe('revokeToken', () => {
  it('stops the token working immediately', async () => {
    const { token, row } = await create(as(mine), 'Kurzlebig', ['workshops:read'])
    expect(await resolveBearer(`Bearer ${token}`)).not.toBeNull()

    await withTenant(as(mine), (tx) => revokeToken(tx, as(mine), row.id))
    expect(await resolveBearer(`Bearer ${token}`)).toBeNull()
  })

  it('refuses to revoke somebody else’s token', async () => {
    const { row } = await create(as(mine), 'Meins', ['workshops:read'])
    // Same tenant, so RLS lets them see it. Ownership is what stops them.
    await expect(
      withTenant(as(theirs), (tx) => revokeToken(tx, as(theirs), row.id)),
    ).rejects.toThrow(TokenError)
  })
})

describe('listTokens', () => {
  it('shows only your own, and not the ones you pulled back', async () => {
    const { row } = await create(as(mine), 'Sichtbar', ['workshops:read'])
    const { row: gone } = await create(as(mine), 'Gezogen', ['workshops:read'])
    await withTenant(as(mine), (tx) => revokeToken(tx, as(mine), gone.id))
    await create(as(theirs), 'Fremd', ['workshops:read'])

    const rows = await withTenant(as(mine), (tx) => listTokens(tx, as(mine)))
    const ids = rows.map((r) => r.id)
    expect(ids).toContain(row.id)
    expect(ids).not.toContain(gone.id)
    expect(rows.every((r) => r.name !== 'Fremd')).toBe(true)
  })
})
