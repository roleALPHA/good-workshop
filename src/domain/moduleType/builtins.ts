import type { CategoryColor } from '@/lib/category-colors'
import data from './builtins.json'

/**
 * The built-in module types, seeded per tenant.
 *
 * Kept as JSON rather than as TypeScript so the provisioning script can read
 * the same file the application does. A second, drifting copy of these
 * definitions is exactly how a tenant ends up with a module type whose schema
 * does not match what the editor renders.
 *
 * `countsAsContent: false` on break / lunch / buffer / note is why it is a
 * first-class column: it drives the "5h30 content, 1h15 breaks" split
 * facilitators check before sending an agenda out.
 */
export type BuiltinModuleType = {
  key: string
  name: string
  description: string
  category: 'opening' | 'content' | 'activity' | 'logistics' | 'closing' | 'custom'
  color: CategoryColor
  icon: string
  defaultDurationMinutes: number
  countsAsContent: boolean
  jsonSchema: Record<string, unknown>
}

export const BUILTIN_MODULE_TYPES = data as BuiltinModuleType[]

export const BUILTIN_BY_KEY: Record<string, BuiltinModuleType> = Object.fromEntries(
  BUILTIN_MODULE_TYPES.map((t) => [t.key, t]),
)
