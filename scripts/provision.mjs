#!/usr/bin/env node
/**
 * Idempotent provisioning. Runs after migrations, on every boot.
 *
 * Must be safe to run a hundred times: it is the step that makes a fresh
 * install usable and an upgraded install consistent, and it runs unattended.
 */
import { readFile } from 'node:fs/promises'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// Runs as gw_app, not as the migration role. Seeding module types is an
// ordinary tenant-scoped application write, and the policies are written
// `to gw_app` -- under FORCE RLS the migration role has no applicable policy at
// all and would be denied everything. Provisioning through the same door the
// application uses also proves that door works.
const url = process.env.DATABASE_URL ?? process.env.MIGRATION_DATABASE_URL
if (!url) {
  console.error('DATABASE_URL is required.')
  process.exit(1)
}

/** Community Edition runs on one tenant with a fixed id. The code path is
 *  byte-identical to cloud; only tenant resolution differs. */
const DEFAULT_TENANT_ID = '00000000-0000-0000-0000-000000000001'

const builtins = JSON.parse(
  await readFile(join(root, 'src/domain/moduleType/builtins.json'), 'utf8'),
)

/**
 * The tenants to provision.
 *
 * Community Edition has exactly one and its id is fixed, so nothing needs to
 * be enumerated -- which keeps the shipped path entirely on gw_app with no
 * bypass anywhere, as the note above insists.
 *
 * Cloud genuinely has to ask, and `tenant` is now under RLS: as gw_app the
 * question "which tenants exist" answers "the one you already are". The list
 * is therefore read through the operator connection -- a read of ids, by the
 * operator running this script, while every write below still goes through
 * gw_app with the context set. That is a much smaller thing than provisioning
 * with a bypass role, and it is the only step that needs it.
 */
async function activeTenants() {
  if (process.env.GW_EDITION !== 'cloud') return [{ id: DEFAULT_TENANT_ID }]

  const operatorUrl = process.env.OPS_DATABASE_URL ?? process.env.ADMIN_DATABASE_URL
  if (!operatorUrl) {
    throw new Error(
      'GW_EDITION=cloud needs OPS_DATABASE_URL (or ADMIN_DATABASE_URL) to enumerate tenants: ' +
        'under RLS the application role can only ever see the tenant it is currently acting as.',
    )
  }

  const operator = new pg.Client({ connectionString: operatorUrl })
  await operator.connect()
  try {
    const { rows } = await operator.query(`select id from tenant where status = 'active'`)
    return rows
  } finally {
    await operator.end()
  }
}

const client = new pg.Client({ connectionString: url })
await client.connect()

try {
  await client.query('begin')

  if (process.env.GW_EDITION !== 'cloud') {
    // The context is set BEFORE the insert, not after. `tenant` is under RLS
    // like everything else now, and its policy compares the row's own id
    // against app.current_tenant() -- so creating a tenant means acting as the
    // tenant being created. Without this the insert is refused by its own
    // WITH CHECK, which is the correct behaviour for an application writer and
    // merely the wrong moment for this one.
    await client.query(`select set_config('app.tenant_id', $1, true)`, [DEFAULT_TENANT_ID])
    await client.query(
      `insert into tenant (id, slug, name) values ($1, 'default', 'GoodWorkshop')
       on conflict (id) do nothing`,
      [DEFAULT_TENANT_ID],
    )
  }

  const tenants = await activeTenants()
  let created = 0
  let updated = 0

  for (const { id: tenantId } of tenants) {
    // Provisioning does not bypass RLS -- it sets the tenant context like any
    // other writer. A provisioning path with a bypass role is a provisioning
    // path that can quietly write into the wrong tenant.
    await client.query(`select set_config('app.tenant_id', $1, true)`, [tenantId])

    for (const [index, type] of builtins.entries()) {
      // A tenant that has edited a built-in owns it now: upgrades skip it
      // entirely rather than silently reverting somebody's colour or wording.
      const { rowCount } = await client.query(
        `update module_type
            set name = $3, description = $4, category = $5, color = $6, icon = $7,
                default_duration_minutes = $8, counts_as_content = $9,
                json_schema = $10, sort_order = $11, updated_at = now()
          where tenant_id = $1 and system_key = $2 and customized_at is null`,
        [
          tenantId,
          type.key,
          type.name,
          type.description,
          type.category,
          type.color,
          type.icon,
          type.defaultDurationMinutes,
          type.countsAsContent,
          JSON.stringify(type.jsonSchema),
          (index + 1) * 10,
        ],
      )
      if (rowCount > 0) {
        updated += rowCount
        continue
      }

      const inserted = await client.query(
        `insert into module_type
           (id, tenant_id, key, name, description, category, color, icon,
            default_duration_minutes, counts_as_content, json_schema,
            is_system, system_key, system_revision, sort_order)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$3,1,$12)
         on conflict (tenant_id, key) do nothing`,
        [
          randomUUID(),
          tenantId,
          type.key,
          type.name,
          type.description,
          type.category,
          type.color,
          type.icon,
          type.defaultDurationMinutes,
          type.countsAsContent,
          JSON.stringify(type.jsonSchema),
          (index + 1) * 10,
        ],
      )
      created += inserted.rowCount
    }
  }

  await bootstrapAdmin(client)

  await client.query('commit')
  console.log(
    `Provisioned ${tenants.length} tenant(s): ${created} module type(s) created, ${updated} updated.`,
  )
} catch (error) {
  await client.query('rollback')
  throw error
} finally {
  await client.end()
}

/**
 * First-run bootstrap. This is the single feature that decides whether an
 * on-prem install succeeds.
 *
 * The link is printed to STDOUT regardless of mail configuration, because the
 * realistic failure is an install with neither HTTPS nor an SMTP relay -- where
 * without this there is literally no way in.
 */
async function bootstrapAdmin(client) {
  const email = process.env.GW_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
  if (!email) return

  // The identity tables are unreachable for gw_app by design -- that separation
  // is what stops an ORM mistake outside the auth module from reading
  // credential material. Stepping into gw_auth explicitly is the sanctioned
  // door, and because gw_app is NOINHERIT the privilege exists only until this
  // transaction ends.
  await client.query('set local role gw_auth')

  const { rows: existing } = await client.query('select id from identity where email = $1', [email])
  let identityId = existing[0]?.id

  if (!identityId) {
    const { rows } = await client.query(
      'insert into identity (id, email, email_verified_at) values ($1, $2, now()) returning id',
      [randomUUID(), email],
    )
    identityId = rows[0].id
  }

  await client.query('reset role')
  await client.query(`select set_config('app.tenant_id', $1, true)`, [DEFAULT_TENANT_ID])

  const { rows: members } = await client.query(
    `insert into member (id, tenant_id, identity_id, role, status)
     values ($1, $2, $3, 'admin', 'active')
     on conflict (tenant_id, identity_id) do nothing
     returning id`,
    [randomUUID(), DEFAULT_TENANT_ID, identityId],
  )

  // Only on the very first run: printing a fresh login link on every boot would
  // put a working credential into the log on every restart.
  if (members.length === 0) return

  await client.query('set local role gw_auth')
  const secret = randomBytes(32).toString('base64url')
  const tokenHash = createHash('sha256').update(secret).digest('hex')
  await client.query(
    // Eine Stunde, nicht 24. Der Link wird beim allerersten Start gedruckt und
    // von einer Betreiberin gelesen, die in dem Moment vor den Logs sitzt --
    // ein Tag Gültigkeit war ein Tag, an dem er in jedem Logauszug, jedem
    // Backup und jeder Support-Anlage ein vollwertiges Admin-Konto ist.
    `insert into email_token (id, purpose, email, identity_id, tenant_id, token_hash, expires_at)
     values ($1, 'login', $2, $3, $4, $5, now() + interval '1 hour')`,
    [randomUUID(), email, identityId, DEFAULT_TENANT_ID, tokenHash],
  )
  await client.query('reset role')

  const base = process.env.GW_APP_URL ?? 'http://localhost:3000'
  console.log('')
  console.log('  Admin angelegt: ' + email)
  console.log('  Einmaliger Anmeldelink (24 Stunden gültig):')
  console.log('')
  console.log('    ' + new URL('/verify?token=' + secret, base))
  console.log('')
}
