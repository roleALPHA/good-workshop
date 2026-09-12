import { randomUUID, createHash } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { withTenant, withoutTenant, type Actor } from '@/server/db'
import { generateSecret, hashSecret, parseOAuthToken } from '@/server/auth/tokens'
import { sql } from 'drizzle-orm'
import {
  createAuthorizationCode,
  findClient,
  issueTokens,
  redeemAuthorizationCode,
  redeemRefreshToken,
  registerClient,
} from './repo'

/**
 * The OAuth flow against a real database.
 *
 * What cannot be asserted without one: that a code is spent exactly once when
 * two requests race for it, that a refresh token rotates, that the SECURITY
 * DEFINER resolver refuses everything it should, and that none of these rows
 * are visible from another tenant.
 */

const TENANT = randomUUID()
const OTHER_TENANT = randomUUID()
const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

let memberId: string
let clientId: string
const identities: string[] = []

const as = (id = memberId): Actor => ({
  tenantId: TENANT,
  memberId: id,
  tenantRole: 'member',
  source: 'web',
})

const challengeFor = (verifier: string) => createHash('sha256').update(verifier).digest('base64url')

const VERIFIER = 'v'.repeat(43)
const RESOURCE = 'https://gw.test/api/mcp'

beforeAll(async () => {
  await ops.connect()
  for (const id of [TENANT, OTHER_TENANT]) {
    await ops.query('insert into tenant (id, slug, name) values ($1, $2, $3)', [
      id,
      `t-${id.slice(0, 8)}`,
      'OAuth',
    ])
  }

  const identityId = randomUUID()
  memberId = randomUUID()
  identities.push(identityId)
  await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
    identityId,
    `o-${identityId}@example.test`,
    'active',
  ])
  await ops.query(
    `insert into member (id, tenant_id, identity_id, role, status) values ($1, $2, $3, 'member', 'active')`,
    [memberId, TENANT, identityId],
  )
})

afterAll(async () => {
  for (const id of [TENANT, OTHER_TENANT]) {
    await ops.query('delete from tenant where id = $1', [id])
  }
  for (const id of identities) await ops.query('delete from identity where id = $1', [id])
  await ops.end()
})

beforeEach(async () => {
  await ops.query('delete from oauth_client where tenant_id = $1', [TENANT])
  const registered = await withTenant(as(), (tx) =>
    registerClient(tx, {
      name: 'Ein Client',
      redirectUris: ['https://client.test/cb'],
      confidential: false,
    }),
  )
  clientId = registered.id
})

const mintCode = () =>
  withTenant(as(), (tx) =>
    createAuthorizationCode(tx, {
      clientId,
      memberId,
      scopes: ['workshops:read'],
      resource: RESOURCE,
      redirectUri: 'https://client.test/cb',
      codeChallenge: challengeFor(VERIFIER),
    }),
  )

describe('an authorization code', () => {
  it('can be spent once', async () => {
    const code = await mintCode()
    const first = await withTenant(as(), (tx) => redeemAuthorizationCode(tx, code))
    expect(first?.memberId).toBe(memberId)

    const second = await withTenant(as(), (tx) => redeemAuthorizationCode(tx, code))
    expect(second).toBeNull()
  })

  it('is spent once even when two requests race for it', async () => {
    const code = await mintCode()

    // The loser of a read-then-write race is somebody replaying an intercepted
    // code. `used_at is null` is part of the UPDATE so Postgres decides, once.
    const [a, b] = await Promise.all([
      withTenant(as(), (tx) => redeemAuthorizationCode(tx, code)),
      withTenant(as(), (tx) => redeemAuthorizationCode(tx, code)),
    ])

    expect([a, b].filter(Boolean)).toHaveLength(1)
  })

  it('is refused once it has expired', async () => {
    const code = await mintCode()
    await ops.query(`update oauth_grant set expires_at = now() - interval '1 minute'`)

    expect(await withTenant(as(), (tx) => redeemAuthorizationCode(tx, code))).toBeNull()
  })
})

describe('a refresh token', () => {
  const issue = () =>
    withTenant(as(), (tx) =>
      issueTokens(tx, {
        clientId,
        memberId,
        scopes: ['workshops:read'],
        resource: RESOURCE,
        withRefresh: true,
      }),
    )

  it('rotates: the old one stops working when it is spent', async () => {
    const issued = await issue()
    const parsed = parseOAuthToken(issued.refreshToken!)!

    const first = await withTenant(as(), (tx) =>
      redeemRefreshToken(tx, parsed.tokenKey, hashSecret(parsed.secret)),
    )
    expect(first?.memberId).toBe(memberId)

    // A stolen refresh token works at most once, and the theft shows up as the
    // legitimate client suddenly being logged out.
    const second = await withTenant(as(), (tx) =>
      redeemRefreshToken(tx, parsed.tokenKey, hashSecret(parsed.secret)),
    )
    expect(second).toBeNull()
  })

  it('is not accepted where an access token is expected', async () => {
    const issued = await issue()
    const refresh = parseOAuthToken(issued.refreshToken!)!

    const rows = await withoutTenant((tx) =>
      tx.execute(sql`
        select member_id from app.resolve_oauth_token(${refresh.tokenKey}, ${hashSecret(refresh.secret)})
      `),
    )
    // The resolver filters on kind = 'access'. The prefix check in the bearer
    // path is the first lock; this is the second.
    expect(rows.rows).toHaveLength(0)
  })
})

describe('the resolver', () => {
  const issue = () =>
    withTenant(as(), (tx) =>
      issueTokens(tx, {
        clientId,
        memberId,
        scopes: ['workshops:read'],
        resource: RESOURCE,
        withRefresh: false,
      }),
    )

  const resolve = (key: string, secret: string) =>
    withoutTenant((tx) =>
      tx.execute(sql`
        select tenant_id, resource, scopes from app.resolve_oauth_token(${key}, ${hashSecret(secret)})
      `),
    )

  it('returns the tenant and the audience the token was minted for', async () => {
    const issued = await issue()
    const parsed = parseOAuthToken(issued.accessToken)!

    const rows = await resolve(parsed.tokenKey, parsed.secret)
    expect(rows.rows[0]).toMatchObject({ tenant_id: TENANT, resource: RESOURCE })
  })

  it('refuses a revoked token', async () => {
    const issued = await issue()
    const parsed = parseOAuthToken(issued.accessToken)!
    await ops.query(`update oauth_token set revoked_at = now()`)

    expect((await resolve(parsed.tokenKey, parsed.secret)).rows).toHaveLength(0)
  })

  it('refuses an expired token', async () => {
    const issued = await issue()
    const parsed = parseOAuthToken(issued.accessToken)!
    await ops.query(`update oauth_token set expires_at = now() - interval '1 second'`)

    expect((await resolve(parsed.tokenKey, parsed.secret)).rows).toHaveLength(0)
  })

  it('refuses the right key with the wrong secret', async () => {
    const issued = await issue()
    const parsed = parseOAuthToken(issued.accessToken)!

    expect((await resolve(parsed.tokenKey, generateSecret(32))).rows).toHaveLength(0)
  })

  it('refuses a token whose member was switched off', async () => {
    const issued = await issue()
    const parsed = parseOAuthToken(issued.accessToken)!
    await ops.query(`update member set status = 'disabled' where id = $1`, [memberId])

    expect((await resolve(parsed.tokenKey, parsed.secret)).rows).toHaveLength(0)

    await ops.query(`update member set status = 'active' where id = $1`, [memberId])
  })
})

describe('the tenant boundary', () => {
  it('hides clients, grants and tokens from another tenant', async () => {
    await mintCode()
    await withTenant(as(), (tx) =>
      issueTokens(tx, {
        clientId,
        memberId,
        scopes: ['workshops:read'],
        resource: RESOURCE,
        withRefresh: true,
      }),
    )

    const otherActor: Actor = {
      tenantId: OTHER_TENANT,
      memberId: null,
      tenantRole: 'member',
      source: 'web',
    }

    for (const table of ['oauth_client', 'oauth_grant', 'oauth_token']) {
      const seen = await withTenant(otherActor, (tx) =>
        tx.execute(sql.raw(`select count(*)::int as n from ${table}`)),
      )
      expect((seen.rows[0] as { n: number }).n, table).toBe(0)
    }
  })

  it('refuses a client row written with a foreign tenant_id', async () => {
    await expect(
      withTenant(as(), (tx) =>
        tx.execute(
          sql.raw(
            `insert into oauth_client (id, tenant_id, client_key, name, redirect_uris)
             values (gen_random_uuid(), '${OTHER_TENANT}', 'x', 'x', array['https://a.test/cb'])`,
          ),
        ),
      ),
    ).rejects.toThrow()
  })

  it('does not find a client of another tenant by its key', async () => {
    const key = generateSecret(18)
    await ops.query(
      `insert into oauth_client (id, tenant_id, client_key, name, redirect_uris)
       values (gen_random_uuid(), $1, $2, 'Fremd', array['https://a.test/cb'])`,
      [OTHER_TENANT, key],
    )

    expect(await withTenant(as(), (tx) => findClient(tx, key))).toBeNull()
  })
})
