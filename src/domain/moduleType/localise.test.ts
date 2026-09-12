import { describe, expect, it } from 'vitest'
import builtins from './builtins.json'
import moduleTypesDe from '@/messages/de/moduleTypes.json'
import { localiseModuleType } from './localise'
import { parseSchema } from './profile'

/**
 * The German catalog and builtins.json say the same words.
 *
 * builtins.json stays the source of truth: scripts/provision.mjs is plain node
 * with no catalog loader, it runs on every boot, and `module_type.name` is NOT
 * NULL -- so something readable has to be written into the row. The catalog is
 * the display layer on top of that row.
 *
 * Which means the two can drift, silently and in the worst direction: a German
 * facilitator would see the stored German while a French one saw a translation
 * of a sentence that no longer exists. So: byte-identical, asserted.
 */

type Catalog = typeof moduleTypesDe
type FieldEntry = { title?: string; description?: string; help?: string }

const fieldOf = (typeKey: string, fieldKey: string): FieldEntry => {
  const shared = (moduleTypesDe.fields as Record<string, FieldEntry>)[fieldKey] ?? {}
  const perType = ((moduleTypesDe.types as Record<string, { fields?: Record<string, FieldEntry> }>)[
    typeKey
  ]?.fields ?? {})[fieldKey]
  return { ...shared, ...perType }
}

describe('the German module-type catalog', () => {
  it.each(builtins.map((type) => [type.key, type] as const))(
    'matches builtins.json for %s',
    (key, type) => {
      const entry = (moduleTypesDe.types as Record<string, { name: string; description: string }>)[
        key
      ]
      expect(entry, `no catalog entry for ${key}`).toBeDefined()
      expect(entry!.name).toBe(type.name)
      expect(entry!.description).toBe(type.description ?? '')
    },
  )

  it('matches builtins.json for every field title, description and help text', () => {
    const mismatches: string[] = []

    for (const type of builtins) {
      const properties = (type.jsonSchema?.properties ?? {}) as unknown as Record<
        string,
        Record<string, unknown>
      >
      for (const [fieldKey, node] of Object.entries(properties)) {
        const entry = fieldOf(type.key, fieldKey)
        const hints = (node['x-gw'] ?? {}) as Record<string, unknown>

        const checks: [string, unknown, string | undefined][] = [
          ['title', node.title, entry.title],
          ['description', node.description, entry.description],
          ['help', hints.help, entry.help],
        ]

        for (const [what, stored, translated] of checks) {
          if (typeof stored !== 'string') continue
          if (stored !== translated) {
            mismatches.push(`${type.key}.${fieldKey}.${what}: ${stored} != ${translated}`)
          }
        }
      }
    }

    expect(mismatches).toEqual([])
  })

  it('has a German label for every enum value a built-in declares', () => {
    const missing: string[] = []

    for (const type of builtins) {
      const properties = (type.jsonSchema?.properties ?? {}) as unknown as Record<
        string,
        Record<string, unknown>
      >
      for (const [fieldKey, node] of Object.entries(properties)) {
        if (!Array.isArray(node.enum)) continue
        const labels = ((moduleTypesDe.fields as Record<string, { enum?: Record<string, string> }>)[
          fieldKey
        ]?.enum ?? {}) as Record<string, string>
        for (const value of node.enum) {
          if (typeof value === 'string' && !labels[value]) {
            missing.push(`${fieldKey}.${value}`)
          }
        }
      }
    }

    expect(missing).toEqual([])
  })

  it('knows every group a built-in uses', () => {
    const groups = new Set<string>()
    for (const type of builtins) {
      const properties = (type.jsonSchema?.properties ?? {}) as unknown as Record<
        string,
        Record<string, unknown>
      >
      for (const node of Object.values(properties)) {
        const hints = (node['x-gw'] ?? {}) as Record<string, unknown>
        if (typeof hints.group === 'string') groups.add(hints.group)
      }
    }

    const known = moduleTypesDe.groups as Record<string, string>
    expect([...groups].filter((group) => !(group in known))).toEqual([])
  })

  it('exports a catalog shape the other languages can be checked against', () => {
    const shape: Catalog = moduleTypesDe
    expect(Object.keys(shape.types)).toHaveLength(builtins.length)
  })
})

const checkIn = builtins.find((type) => type.key === 'check_in')!

const rowFor = (over: Partial<Parameters<typeof localiseModuleType>[0]> = {}) => ({
  name: checkIn.name,
  description: checkIn.description,
  jsonSchema: checkIn.jsonSchema,
  isSystem: true,
  systemKey: 'check_in',
  customizedAt: null as Date | null,
  ...over,
})

describe('localiseModuleType', () => {
  it('translates the name and description of a built-in', () => {
    const fr = localiseModuleType(rowFor(), 'fr')
    expect(fr.name).toBe('Check-in')
    expect(fr.description).toBe('Chacun·e prend la parole une fois.')

    const es = localiseModuleType(rowFor(), 'es')
    expect(es.description).toBe('Todo el mundo toma la palabra una vez.')
  })

  it('translates field labels and groups inside the schema', () => {
    const groups = parseSchema(localiseModuleType(rowFor(), 'en').jsonSchema)
    const labels = groups.flatMap((group) => group.fields.map((field) => field.label))

    expect(labels).toContain('Facilitator notes')
    expect(labels).toContain('Materials')
    expect(groups.map((group) => group.name)).toContain('Content')
  })

  it('prefers a per-type override over the shared field entry', () => {
    // `prompt` is the one field whose title differs by type: an opening
    // question in a check-in, a closing one in a check-out.
    const label = (typeKey: string, systemKey: string) => {
      const type = builtins.find((entry) => entry.key === typeKey)!
      const row = rowFor({ systemKey, jsonSchema: type.jsonSchema, name: type.name })
      return parseSchema(localiseModuleType(row, 'en').jsonSchema)
        .flatMap((group) => group.fields)
        .find((field) => field.key === 'prompt')?.label
    }

    expect(label('check_in', 'check_in')).toBe('Opening question')
    expect(label('check_out', 'check_out')).toBe('Closing question')
  })

  /**
   * The hook profile.ts has always read and builtins.json has never filled,
   * which is why the inspector used to show `humanise('small_groups')` -- "Small
   * groups" -- while the Markdown export said "Kleingruppen" for the same value.
   */
  it('fills in the enum labels that nothing used to fill', () => {
    const options = (locale: 'de' | 'fr') =>
      parseSchema(localiseModuleType(rowFor(), locale).jsonSchema)
        .flatMap((group) => group.fields)
        .find((field) => field.key === 'participation')?.options

    expect(options('de')).toContainEqual({ value: 'small_groups', label: 'Kleingruppen' })
    expect(options('fr')).toContainEqual({ value: 'small_groups', label: 'Petits groupes' })
  })

  /**
   * All or nothing at the row, and the same predicate scripts/provision.mjs
   * uses to decide the row belongs to the tenant. A form with three
   * tenant-German labels and four French ones reads as a bug.
   */
  it('leaves a customised row exactly as the tenant wrote it', () => {
    const customised = rowFor({ name: 'Ankommen', customizedAt: new Date() })
    expect(localiseModuleType(customised, 'fr')).toBe(customised)
  })

  it('never translates a tenant-defined type', () => {
    const own = rowFor({ name: 'Retro', isSystem: false, systemKey: null })
    expect(localiseModuleType(own, 'en')).toBe(own)
  })

  /**
   * A built-in added in a release before its translations land must render in
   * German, not as a raw message key -- a key would not merely look wrong, it
   * would end up in a Markdown file handed to participants.
   *
   * The fallback is per key, not per row, and the split is the useful one: a
   * type nobody has translated keeps its stored name, while its `materials`
   * field still says "Matériel" because that entry is shared vocabulary and the
   * catalog has had it for releases.
   */
  it('falls back to the stored German for keys the catalog does not have', () => {
    const unknown = rowFor({ systemKey: 'not_translated_yet', name: 'Brandneu' })
    const out = localiseModuleType(unknown, 'fr')

    expect(out.name).toBe('Brandneu')

    const labels = parseSchema(out.jsonSchema)
      .flatMap((group) => group.fields)
      .map((field) => field.label)
    expect(labels).toContain("Notes d'animation")
  })

  it('keeps a field the catalog has never seen in its stored wording', () => {
    const withOwnField = rowFor({
      systemKey: 'not_translated_yet',
      jsonSchema: {
        type: 'object',
        properties: {
          erfundenes_feld: { type: 'string', title: 'Erfundenes Feld' },
        },
      },
    })

    const labels = parseSchema(localiseModuleType(withOwnField, 'es').jsonSchema)
      .flatMap((group) => group.fields)
      .map((field) => field.label)
    expect(labels).toEqual(['Erfundenes Feld'])
  })

  it('does not touch anything the validator depends on', () => {
    const before = JSON.parse(JSON.stringify(checkIn.jsonSchema)) as Record<string, unknown>
    const after = localiseModuleType(rowFor(), 'es').jsonSchema as Record<string, unknown>

    const shape = (schema: unknown): unknown => {
      if (Array.isArray(schema)) return schema.map(shape)
      if (typeof schema !== 'object' || schema === null) return schema
      const out: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(schema)) {
        // Exactly the keys localiseModuleType is allowed to rewrite.
        if (key === 'title' || key === 'description' || key === 'x-gw') continue
        out[key] = shape(value)
      }
      return out
    }

    expect(shape(after)).toEqual(shape(before))
  })
})
