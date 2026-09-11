import type { Locale } from '@/i18n/config'
import { moduleTypeText } from '@/i18n/module-type-catalog'

/**
 * A built-in block type, shown in the reader's language.
 *
 * WHAT IS TRANSLATED AND WHAT IS NOT. The row in `module_type` stays the
 * stored truth -- scripts/provision.mjs writes it in German on every boot and
 * has no catalog loader -- and this rewrites only what a person reads: the
 * name, the description, and inside the JSON Schema the `title`, the field
 * `description`, `x-gw.group`, `x-gw.help` and an injected `x-gw.enumLabels`.
 *
 * Never `properties`, `required`, `type`, `enum`, `format`, `maxLength`. The
 * schema that comes out still validates exactly the same documents, so
 * validate.ts and every `additionalProperties: false` are untouched by this.
 *
 * The neat consequence is that profile.ts needs no change at all: it already
 * reads `node.title`, `hints.group`, `hints.help` and `hints.enumLabels`. That
 * last one was a hook nothing filled -- which is why the inspector has been
 * showing "Small groups" from `humanise()` while the Markdown export said
 * "Kleingruppen" for the same value.
 *
 * A row the tenant has customised is returned untouched. See the note at
 * `isTranslatable`.
 */

export type LocalisableModuleType = {
  name: string
  description: string
  jsonSchema: unknown
  isSystem: boolean
  systemKey: string | null
  customizedAt: Date | null
}

type FieldEntry = {
  title?: string
  description?: string
  help?: string
  enum?: Record<string, string>
}

/**
 * All or nothing, at the row.
 *
 * `customized_at is not null` is exactly the predicate scripts/provision.mjs
 * already uses to decide the row belongs to the tenant, and one predicate with
 * one meaning is worth more than a cleverer rule. Translating half a customised
 * type would also mistranslate by design: somebody who renames *Material* to
 * *Material & Medien* keeps the field key `materials`, and a per-field fallback
 * would cheerfully serve "Matériel" back over their edit.
 *
 * The cost is honest: change one colour on a built-in and that whole type stops
 * being translated. The screen where that happens should say so at the moment
 * it happens.
 */
function isTranslatable(row: LocalisableModuleType): boolean {
  return row.isSystem && row.systemKey !== null && row.customizedAt === null
}

export function localiseModuleType<T extends LocalisableModuleType>(row: T, locale: Locale): T {
  if (!isTranslatable(row)) return row

  const key = row.systemKey!
  const read = (path: string) => moduleTypeText(locale, path)

  return {
    ...row,
    // The stored German is the fallback for every one of these. A built-in
    // added in a release before its translations land renders in German rather
    // than as a raw message key -- and a raw key would not merely look wrong,
    // it would end up in a Markdown file somebody hands to participants.
    name: read(`types.${key}.name`) ?? row.name,
    description: read(`types.${key}.description`) ?? row.description,
    jsonSchema: localiseSchema(row.jsonSchema, key, read),
  }
}

function localiseSchema(
  schema: unknown,
  typeKey: string,
  read: (path: string) => string | undefined,
): unknown {
  if (typeof schema !== 'object' || schema === null) return schema
  const source = schema as Record<string, unknown>
  const properties = source.properties
  if (typeof properties !== 'object' || properties === null) return schema

  const translated: Record<string, unknown> = {}

  for (const [fieldKey, node] of Object.entries(properties as Record<string, unknown>)) {
    if (typeof node !== 'object' || node === null) {
      translated[fieldKey] = node
      continue
    }

    const field = node as Record<string, unknown>
    const hints = (field['x-gw'] ?? {}) as Record<string, unknown>

    // Per-type override first, shared entry second, stored value last.
    const pick = (attr: keyof FieldEntry) =>
      read(`types.${typeKey}.fields.${fieldKey}.${attr}`) ?? read(`fields.${fieldKey}.${attr}`)

    const nextHints: Record<string, unknown> = { ...hints }
    const help = pick('help')
    if (help !== undefined) nextHints.help = help
    if (typeof hints.group === 'string') {
      nextHints.group = read(`groups.${hints.group}`) ?? hints.group
    }

    // The hook profile.ts has always read and builtins.json has never filled.
    if (Array.isArray(field.enum)) {
      const labels: Record<string, string> = {}
      for (const value of field.enum) {
        if (typeof value !== 'string') continue
        const label =
          read(`types.${typeKey}.fields.${fieldKey}.enum.${value}`) ??
          read(`fields.${fieldKey}.enum.${value}`)
        if (label !== undefined) labels[value] = label
      }
      if (Object.keys(labels).length > 0) nextHints.enumLabels = labels
    }

    translated[fieldKey] = {
      ...field,
      ...(pick('title') !== undefined ? { title: pick('title') } : {}),
      ...(pick('description') !== undefined ? { description: pick('description') } : {}),
      ...(Object.keys(nextHints).length > 0 ? { 'x-gw': nextHints } : {}),
    }
  }

  return { ...source, properties: translated }
}
