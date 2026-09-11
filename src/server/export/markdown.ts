import type { DayDoc } from '@/domain/agenda/types'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { flattenDay, toScheduleItems } from '@/features/agenda/flatten'
import { richTextToMarkdown } from '@/lib/richtext/markdown'
import { isRichTextValue } from '@/lib/richtext/schema'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config'

/**
 * The Markdown exporter.
 *
 * A pure function with no database access, shared by the HTTP route, the print
 * view and (later) the MCP tool. Two output flavours because they serve
 * genuinely different purposes: a table pastes cleanly into Notion, Confluence
 * and GitHub, while an outline is what you put in an e-mail.
 *
 * Field rendering is driven by the module type's ui_schema export hints, not by
 * a switch over module types. That is the design point that stops this file
 * growing a branch per type -- a tenant-defined type exports sensibly with no
 * code at all, and beautifully with three lines of configuration.
 */

export type ExportOptions = {
  /**
   * The language the file is written in.
   *
   * A parameter rather than something read from the request: an export is
   * often handed to somebody other than the person producing it, and the MCP
   * tool that returns Markdown has no viewer at all.
   */
  locale?: Locale
  flavor?: 'agenda' | 'outline'
  includeDescriptions?: boolean
  includeFacilitatorNotes?: boolean
  includeFrontmatter?: boolean
}

export type WorkshopMeta = {
  title: string
  status?: string
  ownerName?: string
  tags?: string[]
  updatedAt?: Date
}

const DEFAULTS: Required<ExportOptions> = {
  locale: DEFAULT_LOCALE,
  flavor: 'agenda',
  includeDescriptions: true,
  // Off by default: notes are explicitly the facilitator's own, and the common
  // case for an export is handing it to participants.
  includeFacilitatorNotes: false,
  includeFrontmatter: true,
}

export function renderDayMarkdown(
  workshop: WorkshopMeta,
  day: DayDoc,
  options: ExportOptions = {},
): string {
  const opts = { ...DEFAULTS, ...options }
  const rows = flattenDay(day)
  const schedule = computeSchedule(day.startMinute, toScheduleItems(rows))

  const out: string[] = []

  if (opts.includeFrontmatter) {
    out.push(
      [
        '---',
        `title: ${yaml(workshop.title)}`,
        day.date ? `date: ${day.date}` : null,
        workshop.tags?.length ? `tags: [${workshop.tags.map(yaml).join(', ')}]` : null,
        `duration: ${formatDuration(schedule.dayEndMinute - schedule.dayStartMinute, { spaced: true })}`,
        '---',
        '',
      ]
        .filter((line) => line !== null)
        .join('\n'),
    )
  }

  out.push(`# ${text(workshop.title)}`)

  const summary = [
    day.title || null,
    day.date,
    `${formatTime(schedule.dayStartMinute, opts.locale)}–${formatTime(schedule.dayEndMinute, opts.locale)}`,
    contentSplit(day),
  ].filter(Boolean)
  out.push(`> ${summary.join(' · ')}`)

  out.push(
    opts.flavor === 'agenda'
      ? renderTable(day, rows, schedule, opts)
      : renderOutline(day, rows, schedule, opts),
  )

  if (opts.flavor === 'agenda' && opts.includeDescriptions) {
    const details = renderDetails(day, rows, schedule, opts)
    if (details) out.push(details)
  }

  out.push('---', 'GoodWorkshop · powered by roleALPHA')

  return (
    out
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  )
}

function renderTable(
  day: DayDoc,
  rows: ReturnType<typeof flattenDay>,
  schedule: ReturnType<typeof computeSchedule>,
  opts: Required<ExportOptions>,
): string {
  const lines = ['| Zeit | Dauer | Block | Info |', '| --- | --- | --- | --- |']

  for (const row of rows) {
    const entry = schedule.entries.get(row.id)
    if (!entry) continue

    if (row.kind === 'cluster') {
      lines.push(
        `| ${formatTime(entry.startMinute, opts.locale)} | ${formatDuration(entry.durationMinutes)} | **${cell(row.cluster.title)}** | ${row.childCount} Blöcke |`,
      )
      continue
    }
    if (row.kind !== 'module') continue

    const type = day.moduleTypes[row.module.moduleTypeId]
    const title = row.depth === 1 ? `↳ ${cell(row.module.title)}` : cell(row.module.title)
    const info = [type?.name, entry.conflict?.kind === 'overlap' ? '⚠ Überschneidung' : null]
      .filter(Boolean)
      .join(' · ')

    lines.push(
      `| ${formatTime(entry.startMinute, opts.locale)}${entry.pinned ? ' 🔒' : ''} | ${formatDuration(entry.durationMinutes)} | ${title} | ${cell(info)} |`,
    )
  }

  return lines.join('\n')
}

function renderOutline(
  day: DayDoc,
  rows: ReturnType<typeof flattenDay>,
  schedule: ReturnType<typeof computeSchedule>,
  opts: Required<ExportOptions>,
): string {
  const lines: string[] = []

  for (const row of rows) {
    const entry = schedule.entries.get(row.id)
    if (!entry) continue

    if (row.kind === 'cluster') {
      lines.push(
        '',
        `## ${text(row.cluster.title)}`,
        `*${formatTime(entry.startMinute, opts.locale)} · ${formatDuration(entry.durationMinutes, { spaced: true })}*`,
      )
      continue
    }
    if (row.kind !== 'module') continue

    const type = day.moduleTypes[row.module.moduleTypeId]
    lines.push(
      '',
      `### ${formatTime(entry.startMinute, opts.locale)}${entry.pinned ? ' 🔒' : ''} · ${text(row.module.title)}`,
      `\`${formatDuration(entry.durationMinutes)}\`${type ? ` · ${type.name}` : ''}`,
    )
    lines.push(...describeModule(row.module.desc, opts))
  }

  return lines.join('\n')
}

function renderDetails(
  day: DayDoc,
  rows: ReturnType<typeof flattenDay>,
  schedule: ReturnType<typeof computeSchedule>,
  opts: Required<ExportOptions>,
): string {
  const lines: string[] = []

  for (const row of rows) {
    if (row.kind !== 'module') continue
    const body = describeModule(row.module.desc, opts)
    if (body.length === 0) continue

    const entry = schedule.entries.get(row.id)
    lines.push(
      '',
      `### ${entry ? formatTime(entry.startMinute, opts.locale) + ' · ' : ''}${text(row.module.title)}`,
      ...body,
    )
  }

  return lines.length > 0 ? ['## Details', ...lines].join('\n') : ''
}

/**
 * Renders a module's `desc` without knowing anything about its type.
 *
 * Rich text becomes Markdown, arrays become comma lists, scalars become a
 * labelled line. Everything else is skipped. A tenant-defined type therefore
 * exports sensibly with zero code.
 */
function describeModule(desc: Record<string, unknown>, opts: Required<ExportOptions>): string[] {
  const lines: string[] = []

  const push = (key: string, raw: unknown) => {
    if (key === 'facilitator_notes' && !opts.includeFacilitatorNotes) return
    if (key === 'description' && !opts.includeDescriptions) return

    if (isRichTextValue(raw)) {
      const text = richTextToMarkdown(raw)
      if (text)
        lines.push(
          '',
          key === 'description' ? text : `**${label(key)}:**`,
          key === 'description' ? '' : text,
        )
      return
    }
    if (Array.isArray(raw) && raw.length > 0) {
      const items = raw.filter((v): v is string => typeof v === 'string').map(value)
      if (items.length > 0) lines.push('', `**${label(key)}:** ${items.join(', ')}`)
      return
    }
    if (typeof raw === 'string' && raw.trim() !== '') {
      lines.push('', `**${label(key)}:** ${value(raw)}`)
      return
    }
    if (typeof raw === 'number') {
      lines.push('', `**${label(key)}:** ${raw}`)
    } else if (typeof raw === 'boolean') {
      lines.push('', `**${label(key)}:** ${raw ? 'ja' : 'nein'}`)
    }
  }

  // description first, then everything else in declaration order.
  push('description', desc.description)
  for (const [key, value] of Object.entries(desc)) {
    if (key === 'description') continue
    push(key, value)
  }

  return lines.filter((line, index, all) => !(line === '' && all[index - 1] === ''))
}

const LABELS: Record<string, string> = {
  facilitator_notes: 'Moderationsnotizen',
  materials: 'Material',
  participation: 'Sozialform',
  group_size: 'Gruppengröße',
  number_of_groups: 'Anzahl Gruppen',
  deliverable: 'Ergebnis',
  room_setup: 'Raumaufbau',
  catering_note: 'Verpflegung',
  method: 'Verfahren',
  options: 'Optionen',
  prompt: 'Impulsfrage',
  question: 'Leitfrage',
  task: 'Arbeitsauftrag',
  instructions: 'Anleitung',
  debrief: 'Auswertung',
  activity: 'Aktivität',
  presenter: 'Vortragende:r',
  key_points: 'Kernaussagen',
  format: 'Format',
}

const label = (key: string) => LABELS[key] ?? key.replaceAll('_', ' ')

/**
 * Enum values are machine keys; an export handed to participants must not read
 * "Sozialform: plenary".
 *
 * A lookup table here rather than in the schema, for now: `DayDoc` carries
 * module types without their JSON Schema, and widening that shape to serve the
 * exporter would push schema plumbing into the editor's hot path. When
 * tenant-defined enums arrive this moves into `x-gw.enumLabels` and is read
 * from the type -- the fallback below already makes an unknown value render as
 * itself rather than disappear.
 */
const VALUE_LABELS: Record<string, string> = {
  plenary: 'Plenum',
  small_groups: 'Kleingruppen',
  pairs: 'Paare',
  individual: 'Einzelarbeit',
  none: 'keine',
  round: 'Reihum',
  popcorn: 'Popcorn',
  written: 'Schriftlich',
  temperature: 'Stimmungsbild',
  dot_voting: 'Punktabfrage',
  fist_of_five: 'Fist of Five',
  consent: 'Konsent',
  majority: 'Mehrheit',
  seated: 'Im Sitzen',
  standing: 'Im Stehen',
  room: 'Ganzer Raum',
  outdoor: 'Draußen',
}

const value = (raw: string) => VALUE_LABELS[raw] ?? raw

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
const text = (value: string) => value.replaceAll('<', '&lt;').replaceAll('>', '&gt;')

/** As above, plus the two characters that would break out of a table row. */
const cell = (value: string) => text(value).replaceAll('|', '\\|').replaceAll('\n', ' ')

const yaml = (value: string) => JSON.stringify(value)

function contentSplit(day: DayDoc): string {
  let content = 0
  let breaks = 0
  for (const mod of day.modules) {
    const type = day.moduleTypes[mod.moduleTypeId]
    if (type?.countsAsContent === false) breaks += mod.durationMinutes
    else content += mod.durationMinutes
  }
  return `${formatDuration(content, { spaced: true })} Inhalt, ${formatDuration(breaks, { spaced: true })} Pausen`
}
