#!/usr/bin/env node
/**
 * Operators of the cloud console -- created on the server, never through a web
 * page.
 *
 *   node scripts/operator.mjs create --email ops@example.com --name "Anna Operator"
 *   node scripts/operator.mjs enroll --email ops@example.com   # a new passkey link
 *   node scripts/operator.mjs disable --email ops@example.com
 *   node scripts/operator.mjs list
 *
 * Runs with OPERATOR_DATABASE_URL (gw_operator). The enrollment link is printed
 * once, is valid for one hour and registers one passkey; it is the only way in
 * for somebody who has none.
 */
import { createHash, randomBytes } from 'node:crypto'
import pg from 'pg'
import { dbOptions } from './db-connect.mjs'
import { builtEdition } from './edition.mjs'

const args = process.argv.slice(2)
const command = args[0]
const flag = (name) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 ? args[index + 1] : undefined
}
const fail = (message) => {
  console.error(message)
  process.exit(1)
}

if (builtEdition() !== 'cloud') fail('The operator console exists in a cloud build only.')
const url = process.env.OPERATOR_DATABASE_URL
if (!url) fail('OPERATOR_DATABASE_URL is required.')

const client = new pg.Client(dbOptions(url, process.env.OPERATOR_DATABASE_PASSWORD_FILE))
await client.connect()

async function enrollmentLink(operatorId) {
  const secret = randomBytes(32).toString('base64url')
  await client.query(
    `insert into operator_enrollment (operator_id, token_hash, expires_at)
     values ($1, $2, now() + interval '1 hour')`,
    [operatorId, createHash('sha256').update(secret).digest('hex')],
  )
  const base = process.env.GW_OPERATOR_URL ?? process.env.GW_APP_URL ?? 'http://localhost:3000'
  console.log('')
  console.log(`  ${new URL(`/operator/enroll?token=${secret}`, base)}`)
  console.log('')
  console.log('  Valid for one hour, for one passkey.')
  console.log('')
}

try {
  const email = flag('email')?.trim().toLowerCase()
  switch (command) {
    case 'create': {
      const name = flag('name')?.trim()
      if (!email || !name) fail('Usage: create --email <address> --name <display name>')
      const { rows } = await client.query(
        `insert into operator (email, display_name) values ($1, $2) returning id`,
        [email, name],
      )
      console.log(`  operator created: ${email}`)
      await enrollmentLink(rows[0].id)
      break
    }
    case 'enroll': {
      if (!email) fail('Usage: enroll --email <address>')
      const { rows } = await client.query(
        `select id from operator where email = $1 and disabled_at is null`,
        [email],
      )
      if (!rows[0]) fail(`No active operator ${email}.`)
      await enrollmentLink(rows[0].id)
      break
    }
    case 'disable': {
      if (!email) fail('Usage: disable --email <address>')
      const { rowCount } = await client.query(
        `update operator set disabled_at = now() where email = $1 and disabled_at is null`,
        [email],
      )
      await client.query(
        `update operator_session set revoked_at = now()
          where operator_id = (select id from operator where email = $1) and revoked_at is null`,
        [email],
      )
      console.log(
        rowCount ? `  ${email} disabled, sessions ended.` : `  No active operator ${email}.`,
      )
      break
    }
    case 'list': {
      const { rows } = await client.query(
        `select o.email, o.display_name, o.disabled_at, count(c.id)::int as passkeys
           from operator o left join operator_credential c on c.operator_id = o.id
          group by o.id order by o.created_at`,
      )
      for (const row of rows) {
        console.log(
          `  ${row.email.padEnd(34)} ${row.display_name.padEnd(24)} ${row.passkeys} passkey(s)${row.disabled_at ? '  disabled' : ''}`,
        )
      }
      break
    }
    default:
      fail('Commands: create, enroll, disable, list')
  }
} finally {
  await client.end()
}
