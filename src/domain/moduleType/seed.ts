import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type { Tx } from '@/server/db'
import { BUILTIN_MODULE_TYPES } from './builtins'

/**
 * The built-in block types, into the tenant the transaction acts in.
 *
 * The same insert scripts/provision.mjs makes on every boot, for a tenant that
 * comes into being between two boots -- a registration in the cloud. Without it
 * a new workspace would have no block types until the next deployment.
 * Idempotent: a type that exists is left alone.
 */
export async function seedBuiltinModuleTypes(tx: Tx, tenantId: string): Promise<void> {
  for (const [index, type] of BUILTIN_MODULE_TYPES.entries()) {
    await tx.execute(sql`
      insert into module_type
        (id, tenant_id, key, name, description, category, color, icon,
         default_duration_minutes, counts_as_content, json_schema,
         is_system, system_key, system_revision, sort_order)
      values
        (${randomUUID()}, ${tenantId}, ${type.key}, ${type.name}, ${type.description},
         ${type.category}, ${type.color}, ${type.icon}, ${type.defaultDurationMinutes},
         ${type.countsAsContent}, ${JSON.stringify(type.jsonSchema)}::jsonb,
         true, ${type.key}, 1, ${(index + 1) * 10})
      on conflict (tenant_id, key) do nothing
    `)
  }
}
