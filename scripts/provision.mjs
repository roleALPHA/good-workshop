#!/usr/bin/env node
/**
 * Idempotent provisioning. Runs after migrations, on every boot.
 *
 * Must be safe to run a hundred times: it is the step that makes a fresh
 * install usable and an upgraded install consistent, and it runs unattended.
 */
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
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

const client = new pg.Client({ connectionString: url })
await client.connect()

try {
  await client.query('begin')

  if (process.env.GW_EDITION !== 'cloud') {
    await client.query(
      `insert into tenant (id, slug, name) values ($1, 'default', 'GoodWorkshop')
       on conflict (id) do nothing`,
      [DEFAULT_TENANT_ID],
    )
  }

  const { rows: tenants } = await client.query(`select id from tenant where status = 'active'`)
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
