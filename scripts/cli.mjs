#!/usr/bin/env node
/**
 * Operator CLI.
 *
 * Exists because of a very specific failure: an on-prem install with no HTTPS
 * (so no passkeys) and no SMTP relay (so no delivered magic links) has NO way
 * in at all. That turns a five-star install into a one-star issue faster than
 * any missing feature. Every command here works without either.
 *
 *   node scripts/cli.mjs login-link --email me@example.com
 *   node scripts/cli.mjs admin create --email me@example.com
 *   node scripts/cli.mjs admin promote --email me@example.com
 *   node scripts/cli.mjs members
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import pg from 'pg'
import { dbOptions } from './db-connect.mjs'

const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'
const MAGIC_LINK_TTL_MINUTES = Number(process.env.GW_MAGIC_LINK_TTL_MINUTES ?? 15)

// Must match src/server/auth/tokens.ts. Restated rather than imported because
// this file is plain Node and has to run from the shipped image without a build.
const hashSecret = (secret) => createHash('sha256').update(secret).digest('hex')
const generateSecret = () => randomBytes(32).toString('base64url')

const argv = process.argv.slice(2)
const positional = []
const flags = {}
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]
  if (!arg.startsWith('--')) {
    positional.push(arg)
    continue
  }
  const next = argv[i + 1]
  // Flags are collected wherever they appear rather than from a fixed argument
  // index -- otherwise `login-link --email x` reads "--email" as a subcommand.
  if (next && !next.startsWith('--')) {
    flags[arg.slice(2)] = next
    i++
  } else {
    flags[arg.slice(2)] = true
  }
}
const [command, subcommand] = positional

const url = process.env.DATABASE_URL
if (!url) fail('DATABASE_URL is not set.')

const client = new pg.Client(dbOptions(url, process.env.DATABASE_PASSWORD_FILE))
await client.connect()

try {
  switch (command) {
    case 'login-link':
      await loginLink(requireEmail())
      break
    case 'admin':
      if (subcommand === 'create') await createAdmin(requireEmail())
      else if (subcommand === 'promote') await promote(requireEmail())
      else fail('Usage: admin create|promote --email <address>')
      break
    case 'members':
      await listMembers()
      break
    case 'token':
      if (subcommand === 'create') await createToken(requireEmail())
      else if (subcommand === 'list') await listTokens()
      else fail('Usage: token create --email <address> [--name <label>] [--scopes a,b]')
      break
    default:
      console.log(
        [
          'GoodWorkshop CLI',
          '',
          '  login-link --email <address>      Print a one-time login link',
          '  admin create --email <address>    Create an identity and a tenant admin',
          '  admin promote --email <address>   Make an existing member an admin',
          '  members                           List members of the default tenant',
          '  token create --email <address>    Create a personal access token for MCP',
          '  token list                        List tokens (never their secrets)',
        ].join('\n'),
      )
  }
} finally {
  await client.end()
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function requireEmail() {
  const email = typeof flags.email === 'string' ? flags.email.trim().toLowerCase() : null
  if (!email) fail('--email is required.')
  return email
}

/**
 * The identity tables are unreachable for gw_app by design -- that separation
 * is what stops a mistake outside the auth module from reading credential
 * material. Stepping into gw_auth is the sanctioned door, and because gw_app is
 * NOINHERIT the privilege lasts exactly as long as this transaction.
 *
 * A consequence worth stating: no query can join across the boundary. Listing
 * members therefore takes two reads, one on each side. That is the boundary
 * working, not an inconvenience to route around.
 */
async function asAuth(fn) {
  await client.query('begin')
  try {
    await client.query('set local role gw_auth')
    const result = await fn()
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}

/** Tenant-scoped work as the ordinary application role. */
async function asTenant(fn) {
  await client.query('begin')
  try {
    await client.query(`select set_config('app.tenant_id', $1, true)`, [DEFAULT_TENANT_ID])
    const result = await fn()
    await client.query('commit')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}

async function findIdentity(email) {
  return asAuth(async () => {
    const { rows } = await client.query('select id, status from identity where email = $1', [email])
    return rows[0] ?? null
  })
}

async function loginLink(email) {
  const found = await findIdentity(email)
  if (!found) fail(`No identity for ${email}. Create one first: admin create --email ${email}`)

  const secret = generateSecret()
  await asAuth(() =>
    client.query(
      `insert into email_token (id, purpose, email, identity_id, tenant_id, token_hash, expires_at)
       values ($1, 'login', $2, $3, $4, $5, now() + ($6 || ' minutes')::interval)`,
      [
        randomUUID(),
        email,
        found.id,
        DEFAULT_TENANT_ID,
        hashSecret(secret),
        MAGIC_LINK_TTL_MINUTES,
      ],
    ),
  )

  const base = process.env.GW_APP_URL ?? 'http://localhost:3000'
  console.log('')
  console.log(`  ${new URL(`/verify?token=${secret}`, base)}`)
  console.log('')
  console.log(`  Valid for ${MAGIC_LINK_TTL_MINUTES} minutes, single use.`)
  console.log('')
}

async function createAdmin(email) {
  let found = await findIdentity(email)
  if (!found) {
    found = await asAuth(async () => {
      const { rows } = await client.query(
        'insert into identity (id, email, email_verified_at) values ($1, $2, now()) returning id, status',
        [randomUUID(), email],
      )
      return rows[0]
    })
    console.log(`  identity created: ${email}`)
  }

  await asTenant(() =>
    client.query(
      `insert into member (id, tenant_id, identity_id, role, status)
       values ($1, $2, $3, 'admin', 'active')
       on conflict (tenant_id, identity_id) do update set role = 'admin', status = 'active'`,
      [randomUUID(), DEFAULT_TENANT_ID, found.id],
    ),
  )

  console.log(`  ${email} is now a tenant admin.`)
  await loginLink(email)
}

async function promote(email) {
  const found = await findIdentity(email)
  if (!found) fail(`No identity for ${email}.`)

  const { rowCount } = await asTenant(() =>
    client.query(`update member set role = 'admin' where identity_id = $1`, [found.id]),
  )
  if (rowCount === 0) fail(`${email} is not a member of the default tenant.`)
  console.log(`  ${email} promoted to admin.`)
}

/**
 * Personal access tokens for MCP clients.
 *
 * The secret is shown once and never again -- only its hash is stored, so a
 * stolen database yields no working tokens. Scopes default to read-only:
 * granting write should be a decision, not an accident.
 */
async function createToken(email) {
  const found = await findIdentity(email)
  if (!found) fail(`No identity for ${email}.`)

  const scopes =
    typeof flags.scopes === 'string'
      ? flags.scopes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : ['workshops:read', 'module_types:read']

  const allowed = [
    'workshops:read',
    'workshops:write',
    'module_types:read',
    'module_types:write',
    'tenant:read',
  ]
  const unknown = scopes.filter((s) => !allowed.includes(s))
  if (unknown.length > 0)
    fail(`Unknown scope(s): ${unknown.join(', ')}. Allowed: ${allowed.join(', ')}`)

  const tokenId = randomBytes(9).toString('base64url').slice(0, 12)
  const secret = randomBytes(32).toString('base64url')

  const memberId = await asTenant(async () => {
    const { rows } = await client.query('select id from member where identity_id = $1', [found.id])
    if (!rows[0]) fail(`${email} is not a member of the default tenant.`)
    return rows[0].id
  })

  await asTenant(() =>
    client.query(
      `insert into personal_access_token (id, tenant_id, member_id, name, token_id, token_hash, scopes)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        randomUUID(),
        DEFAULT_TENANT_ID,
        memberId,
        typeof flags.name === 'string' ? flags.name : 'MCP',
        tokenId,
        hashSecret(secret),
        scopes,
      ],
    ),
  )

  console.log('')
  console.log(`  gwp_${tokenId}_${secret}`)
  console.log('')
  console.log(`  Scopes: ${scopes.join(', ')}`)
  console.log('  Dieses Token wird nur einmal angezeigt.')
  console.log('')
}

async function listTokens() {
  const rows = await asTenant(async () => {
    const result = await client.query(
      `select name, token_id, scopes, last_used_at, revoked_at from personal_access_token order by created_at`,
    )
    return result.rows
  })

  if (rows.length === 0) {
    console.log('  No tokens yet. Create one: token create --email <address>')
    return
  }
  for (const row of rows) {
    const state = row.revoked_at
      ? 'revoked'
      : row.last_used_at
        ? `last used ${row.last_used_at.toISOString().slice(0, 10)}`
        : 'never used'
    console.log(
      `  ${row.name.padEnd(20)} gwp_${row.token_id}_…  ${row.scopes.join(',').padEnd(38)} ${state}`,
    )
  }
}

async function listMembers() {
  const members = await asTenant(async () => {
    const { rows } = await client.query(
      'select id, identity_id, role, status from member order by created_at',
    )
    return rows
  })

  if (members.length === 0) {
    console.log('  No members yet. Create one: admin create --email <address>')
    return
  }

  const emails = await asAuth(async () => {
    const { rows } = await client.query(
      'select id, email from identity where id = any($1::uuid[])',
      [members.map((m) => m.identity_id)],
    )
    return new Map(rows.map((r) => [r.id, r.email]))
  })

  for (const m of members) {
    console.log(
      `  ${(emails.get(m.identity_id) ?? '?').padEnd(34)} ${m.role.padEnd(7)} ${m.status}`,
    )
  }
}
