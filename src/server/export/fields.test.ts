import { describe, expect, it } from 'vitest'
import type { ModuleTypeDto } from '@/domain/agenda/types'
import { markdownToRichText } from '@/lib/richtext/markdown'
import { exportableFields } from './fields'

/**
 * Which fields of a block leave the application, with which label and value.
 *
 * Shared by the Markdown export and the print view. The print view used to
 * have its own idea -- description, notes, the summary chips -- and so
 * dropped everything behind "Mehr Felder" with no way to ask for it, while the
 * Markdown file of the same day carried all of it.
 */

const type: ModuleTypeDto = {
  id: 'mt-1',
  key: 'group_work',
  name: 'Gruppenarbeit',
  color: 'emerald',
  icon: 'users',
  defaultDurationMinutes: 30,
  countsAsContent: true,
  jsonSchema: {
    type: 'object',
    properties: {
      description: { type: 'string', format: 'richtext', title: 'Beschreibung' },
      task: { type: 'string', format: 'richtext', title: 'Arbeitsauftrag' },
      format: {
        type: 'string',
        title: 'Format',
        enum: ['online', 'onsite'],
        'x-gw': { enumLabels: { online: 'Online', onsite: 'Vor Ort' } },
      },
      group_size: { type: 'integer', title: 'Gruppengröße' },
      roles: { type: 'array', title: 'Rollen', items: { type: 'string' } },
      recorded: { type: 'boolean', title: 'Aufgezeichnet' },
      facilitator_notes: {
        type: 'string',
        format: 'richtext',
        title: 'Notizen',
        'x-gw': { private: true },
      },
    },
  },
}

const desc = {
  task: markdownToRichText('In Vierergruppen sammeln'),
  description: markdownToRichText('Worum es geht'),
  format: 'onsite',
  group_size: 4,
  roles: ['Zeit', 'Protokoll'],
  recorded: false,
  facilitator_notes: markdownToRichText('Nur für mich'),
  old_field: 'aus einer früheren Fassung',
  empty: '',
}

const opts = { locale: 'de' as const, includePrivateFields: false }

describe('exportableFields', () => {
  it('puts the description first and labels every field from the schema', () => {
    const fields = exportableFields(desc, type, opts)

    expect(fields.map((field) => field.key)).toEqual([
      'description',
      'task',
      'format',
      'group_size',
      'roles',
      'recorded',
      'old_field',
    ])
    expect(fields[1]).toMatchObject({ label: 'Arbeitsauftrag', kind: 'rich' })
  })

  it('turns values into what the screen says, not what is stored', () => {
    const byKey = Object.fromEntries(
      exportableFields(desc, type, opts).map((field) => [field.key, field]),
    )

    expect(byKey.format).toEqual({ key: 'format', label: 'Format', kind: 'text', value: 'Vor Ort' })
    expect(byKey.group_size).toMatchObject({ kind: 'text', value: '4' })
    expect(byKey.roles).toMatchObject({ kind: 'text', value: 'Zeit, Protokoll' })
    expect(byKey.recorded).toMatchObject({ kind: 'text', value: 'nein' })
  })

  it('keeps private fields back unless they are asked for', () => {
    expect(exportableFields(desc, type, opts).map((f) => f.key)).not.toContain('facilitator_notes')
    expect(
      exportableFields(desc, type, { ...opts, includePrivateFields: true }).map((f) => f.key),
    ).toContain('facilitator_notes')
  })

  it('names a field the schema no longer knows by its key, made readable', () => {
    const legacy = exportableFields(desc, type, opts).find((field) => field.key === 'old_field')
    expect(legacy).toEqual({
      key: 'old_field',
      label: 'old field',
      kind: 'text',
      value: 'aus einer früheren Fassung',
    })
  })
})
