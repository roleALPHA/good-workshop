import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { deletePasskey, listPasskeys } from './passkey'

/**
 * Managing the passkeys on an account.
 *
 * The property that matters is the one an id in a URL could break: a passkey
 * belongs to exactly one identity, and nobody may strip somebody else's device
 * by naming it. That check lives inside the DELETE rather than in front of it,
 * and this file is what holds it there.
 */

const ops = new pg.Client({ connectionString: process.env.OPS_DATABASE_URL })

const mine = randomUUID()
const theirs = randomUUID()
const credentials: string[] = []

async function makeIdentity(id: string, label: string) {
  await ops.query('insert into identity (id, email, status) values ($1, $2, $3)', [
    id,
    `${label}-${id}@example.test`,
    'active',
  ])
}

async function makePasskey(identityId: string, nickname: string): Promise<string> {
  const id = randomUUID()
  credentials.push(id)
  await ops.query(
    `insert into webauthn_credential
       (id, identity_id, credential_id, public_key, sign_count, transports, device_type, backed_up, nickname)
     values ($1, $2, $3, 'cHVibGlj', 0, '{}', 'singleDevice', false, $4)`,
    [id, identityId, `cred-${id}`, nickname],
  )
  return id
}

beforeAll(async () => {
  await ops.connect()
  await makeIdentity(mine, 'mine')
  await makeIdentity(theirs, 'theirs')
})

afterAll(async () => {
  for (const id of credentials) {
    await ops.query('delete from webauthn_credential where id = $1', [id])
  }
  for (const id of [mine, theirs]) await ops.query('delete from identity where id = $1', [id])
  await ops.end()
})

describe('the passkeys on an account', () => {
  it('lists only your own, and says nothing about the key material', async () => {
    const a = await makePasskey(mine, 'MacBook')
    await makePasskey(theirs, 'Fremdes Gerät')

    const rows = await listPasskeys(mine)
    expect(rows.map((r) => r.id)).toEqual([a])
    expect(rows.map((r) => r.nickname)).toEqual(['MacBook'])

    // Nothing an XSS would want: no public key, no counter.
    expect(Object.keys(rows[0] ?? {})).not.toContain('publicKey')
    expect(Object.keys(rows[0] ?? {})).not.toContain('signCount')
  })

  it('removes one of yours', async () => {
    const id = await makePasskey(mine, 'Zum Entfernen')
    expect(await deletePasskey(mine, id)).toBe(true)
    expect((await listPasskeys(mine)).map((r) => r.id)).not.toContain(id)
  })

  it('refuses to remove somebody else’s, even with the right id', async () => {
    const id = await makePasskey(theirs, 'Nicht deins')

    expect(await deletePasskey(mine, id)).toBe(false)
    // Still there: the identity is part of the statement, not a check in front
    // of it that a second code path could forget.
    expect((await listPasskeys(theirs)).map((r) => r.id)).toContain(id)
  })

  it('reports nothing removed for an id that does not exist', async () => {
    expect(await deletePasskey(mine, randomUUID())).toBe(false)
  })
})
