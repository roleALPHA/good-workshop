import type { DayDoc, ModuleTypeDto } from '@/domain/agenda/types'
import { parseSchema } from '@/domain/moduleType/profile'
import { richTextToMarkdown } from '@/lib/richtext/markdown'
import { isRichTextValue, type RichTextValue } from '@/lib/richtext/schema'
import type { Locale } from '@/i18n/config'
import { translator } from '@/i18n/translator'
import type { ExportOptions } from './markdown'

/**
 * Turning one block's fields into Markdown.
 *
 * Its own file because markdown.ts lays out a DAY -- headings, tables, the
 * order of things -- while this renders the `desc` of a single block out of the
 * schema profile. The seam is real: one knows about days, the other about
 * fields, and neither needs the other's vocabulary.
 */

/** One field of a block as it leaves the application: labelled, and in words. */
export type ExportableField =
  | { key: string; label: string; kind: 'rich'; value: RichTextValue }
  | { key: string; label: string; kind: 'text'; value: string }

/**
 * Which fields of a block go out, under which label and with which value.
 *
 * Shared by the Markdown export and the print view, which lay them out
 * differently and must not disagree about what is in them. The print view used
 * to have its own short list -- description, notes, summary chips -- and so had
 * no way at all to carry what sits behind "Mehr Felder", while the Markdown
 * file of the same day carried every field.
 *
 * The labels used to be a table in this file, next to a second table for enum
 * values. The comment there said they belonged in the schema and named the
 * blocker: "DayDoc carries module types without their JSON Schema". That has
 * not been true for a while -- ModuleTypeDto.jsonSchema is declared in
 * domain/agenda/types.ts and filled in loadDay -- and the two tables had
 * quietly disagreed with the inspector in the meantime.
 *
 * So both are gone, and this reads the same FieldSpec[] the inspector renders.
 * Which also means a TENANT-DEFINED type exports with its real labels, rather
 * than with `key.replaceAll('_', ' ')`.
 */
export function exportableFields(
  desc: Record<string, unknown>,
  type: ModuleTypeDto | undefined,
  opts: { locale: Locale; includePrivateFields: boolean },
): ExportableField[] {
  const t = translator(opts.locale, 'export')
  const out: ExportableField[] = []
  const fields = new Map(
    parseSchema(type?.jsonSchema)
      .flatMap((group) => group.fields)
      .map((field) => [field.key, field]),
  )

  /** The schema's title, or the key made readable -- never a raw key. */
  const label = (key: string) => fields.get(key)?.label ?? key.replaceAll('_', ' ')

  /** An export handed to participants must not read "Sozialform: plenary". */
  const value = (key: string, raw: string) =>
    fields.get(key)?.options?.find((option) => option.value === raw)?.label ?? raw

  const push = (key: string, raw: unknown) => {
    /**
     * Withheld by the field's OWN declaration, not by its name.
     *
     * This used to read `key === 'facilitator_notes'`, which was right for
     * exactly as long as that was the only field carrying `x-gw.private`. A
     * second one is a schema edit rather than a code change, so nothing would
     * have failed -- it would simply have gone out in the handover.
     *
     * A field the schema no longer describes is NOT withheld: those are the
     * "legacy fields" the inspector still shows, read-only, to everybody who
     * can open the day. Dropping them here would quietly remove from the
     * handover something the application displays.
     */
    if (fields.get(key)?.private && !opts.includePrivateFields) return

    const text = (value: string) => out.push({ key, label: label(key), kind: 'text', value })

    if (isRichTextValue(raw)) {
      out.push({ key, label: label(key), kind: 'rich', value: raw })
    } else if (Array.isArray(raw)) {
      const items = raw
        .filter((v): v is string => typeof v === 'string')
        .map((item) => value(key, item))
      if (items.length > 0) text(items.join(', '))
    } else if (typeof raw === 'string' && raw.trim() !== '') {
      text(value(key, raw))
    } else if (typeof raw === 'number') {
      text(String(raw))
    } else if (typeof raw === 'boolean') {
      text(raw ? t('yes') : t('no'))
    }
  }

  // description first, then everything else in declaration order.
  push('description', desc.description)
  for (const [key, raw] of Object.entries(desc)) {
    if (key !== 'description') push(key, raw)
  }
  return out
}

/**
 * Renders a module's `desc` as Markdown: rich text as a block under a bold
 * label, everything else as a labelled line. The description goes without a
 * label -- it is what the block is about, not one of its attributes.
 */
export function describeModule(
  desc: Record<string, unknown>,
  type: ModuleTypeDto | undefined,
  opts: Required<ExportOptions>,
): string[] {
  const lines: string[] = []

  for (const field of exportableFields(desc, type, opts)) {
    if (field.key === 'description' && !opts.includeDescriptions) continue

    if (field.kind === 'rich') {
      const text = richTextToMarkdown(field.value)
      if (!text) continue
      if (field.key === 'description') lines.push('', text, '')
      else lines.push('', `**${field.label}:**`, text)
    } else {
      lines.push('', `**${field.label}:** ${field.value}`)
    }
  }

  return lines.filter((line, index, all) => !(line === '' && all[index - 1] === ''))
}

/**
 * User text on its way into the document.
 *
 * The export is a Markdown file, and Markdown renderers pass raw HTML through
 * by default -- wikis, static site generators, chat tools. This file is not the
 * end of the journey, so a title of `<img src=x onerror=...>` would be inert
 * here and live wherever somebody pastes it.
 *
 * Only the angle brackets. Escaping the ampersand as well was the first
 * attempt, and it was wrong: this fixture alone has "Ankommen & Rahmen" and
 * "Begrüßung & Organisatorisches", and an export is read as plain text at
 * least as often as it is rendered -- turning those into "&amp;" damages the
 * common case to defend against nothing. An ampersand cannot open a tag, and
 * an entity a user types stays an entity: HTML does not re-parse it into one.
 *
 * Markdown's own punctuation is left alone too. Emphasis is not an exploit,
 * and escaping asterisks would mangle every title that contains one.
 */
export const text = (value: string) => value.replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/** As above, plus the two characters that would break out of a table row. */
export const cell = (value: string) => text(value).replaceAll('|', '\\|').replaceAll('\n', ' ')

export const yaml = (value: string) => JSON.stringify(value)

/**
 * Who answers for a block, by name.
 *
 * Without the "external" mark the screen carries: an export is most often
 * handed to people outside the workspace, for whom that distinction is the
 * workspace's business rather than theirs.
 */
export const namesOf = (mod: DayDoc['modules'][number]) =>
  (mod.responsible ?? []).map((person) => person.name).join(', ')
