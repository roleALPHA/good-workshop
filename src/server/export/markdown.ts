import type { DayDoc } from '@/domain/agenda/types'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { flattenDay, toScheduleItems } from '@/features/agenda/flatten'
import { richTextToMarkdown } from '@/lib/richtext/markdown'
import { isRichTextValue } from '@/lib/richtext/schema'
import { ATTRIBUTION_MARKDOWN } from '@/lib/attribution'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config'
import { parseSchema } from '@/domain/moduleType/profile'
import type { ModuleTypeDto } from '@/domain/agenda/types'
import { translator } from '@/i18n/translator'

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
  /**
   * Fields the schema marks `x-gw.private` -- facilitation notes today, and
   * whatever a block type declares tomorrow. Named after the rule rather than
   * after the one field it started with.
   */
  includePrivateFields?: boolean
  includeFrontmatter?: boolean
}

export type WorkshopMeta = {
  title: string
  status?: string
  ownerName?: string
  tags?: string[]
  /** The folders it sits in, outermost first. */
  folderPath?: string[]
  updatedAt?: Date
}

/**
 * The resolved options, plus how deep the day sits.
 *
 * A day exported on its own owns the document: its clusters are `##`. The same
 * day inside a workshop export sits under the day's own `##`, so everything in
 * it moves one level down. The offset lives here rather than in the callers,
 * because every heading in this file has to agree on it.
 */
type Opts = Required<ExportOptions> & { depth: number }

/** The heading marker for level `n`, at the current depth. */
const h = (opts: Opts, n: number) => '#'.repeat(n + opts.depth)

const DEFAULTS: Required<ExportOptions> = {
  locale: DEFAULT_LOCALE,
  flavor: 'agenda',
  includeDescriptions: true,
  // Off by default: notes are explicitly the facilitator's own, and the common
  // case for an export is handing it to participants.
  includePrivateFields: false,
  includeFrontmatter: true,
}

export function renderDayMarkdown(
  workshop: WorkshopMeta,
  day: DayDoc,
  options: ExportOptions = {},
): string {
  const opts: Opts = { ...DEFAULTS, ...options, depth: 0 }
  const part = layOutDay(day, opts)

  const out: string[] = []
  if (opts.includeFrontmatter) out.push(frontmatter(workshop, [part]))
  out.push(`# ${text(workshop.title)}`)
  out.push(...part.body)
  out.push('---', ATTRIBUTION_MARKDOWN)
  return finish(out)
}

/**
 * Every day of a workshop in one file.
 *
 * One file rather than one per day in an archive: what is exported is a
 * workshop, and a workshop is read from beginning to end. An archive asks the
 * reader to unpack it first and hands them a folder of fragments; this opens.
 *
 * The days sit under the workshop's heading, which is why everything inside
 * them moves one level down.
 */
export function renderWorkshopMarkdown(
  workshop: WorkshopMeta,
  days: readonly DayDoc[],
  options: ExportOptions = {},
): string {
  const opts: Opts = { ...DEFAULTS, ...options, depth: 1 }
  const parts = days.map((day) => layOutDay(day, opts))

  const out: string[] = []
  if (opts.includeFrontmatter) out.push(frontmatter(workshop, parts))
  out.push(`# ${text(workshop.title)}`)
  if (workshop.folderPath?.length) out.push(`> ${workshop.folderPath.map(text).join(' / ')}`)

  parts.forEach((part, index) => {
    out.push(`## ${dayHeading(part.day, index, opts)}`)
    out.push(...part.body)
  })

  // A workshop without a single day is still a workshop, and an export that
  // answers with a title and nothing else is clearer than one that fails.
  if (parts.length === 0) out.push(`*${translator(opts.locale, 'export')('noDays')}*`)

  out.push('---', ATTRIBUTION_MARKDOWN)
  return finish(out)
}

type DayPart = {
  day: DayDoc
  schedule: ReturnType<typeof computeSchedule>
  body: string[]
}

/** A day's summary line and its agenda, at whatever depth it is being put. */
function layOutDay(day: DayDoc, opts: Opts): DayPart {
  const rows = flattenDay(day)
  const schedule = computeSchedule(day.startMinute, toScheduleItems(rows))

  const summary = [
    day.title || null,
    day.date,
    `${formatTime(schedule.dayStartMinute, opts.locale)}–${formatTime(schedule.dayEndMinute, opts.locale)}`,
    contentSplit(day, opts.locale),
  ].filter(Boolean)

  const body = [`> ${summary.join(' · ')}`]
  body.push(
    opts.flavor === 'agenda'
      ? renderTable(day, rows, schedule, opts)
      : renderOutline(day, rows, schedule, opts),
  )
  if (opts.flavor === 'agenda' && opts.includeDescriptions) {
    const details = renderDetails(day, rows, schedule, opts)
    if (details) body.push(details)
  }

  return { day, schedule, body }
}

/** What a day is called in a workshop export -- its own title, its date, or its number. */
function dayHeading(day: DayDoc, index: number, opts: Opts): string {
  const named = day.title || day.date
  return named ? text(named) : translator(opts.locale, 'export')('dayNumber', { n: index + 1 })
}

function frontmatter(workshop: WorkshopMeta, parts: readonly DayPart[]): string {
  const minutes = parts.reduce(
    (sum, part) => sum + (part.schedule.dayEndMinute - part.schedule.dayStartMinute),
    0,
  )
  const dates = parts.map((part) => part.day.date).filter(Boolean)
  return [
    '---',
    `title: ${yaml(workshop.title)}`,
    // One day keeps `date`, the field every Markdown reader knows. Several get
    // `dates`, a list: squeezing them into the scalar would make tooling read
    // the first one as the workshop's date.
    dates.length === 1 ? `date: ${dates[0]}` : null,
    dates.length > 1 ? `dates: [${dates.map(String).map(yaml).join(', ')}]` : null,
    workshop.folderPath?.length ? `folder: ${yaml(workshop.folderPath.join(' / '))}` : null,
    workshop.tags?.length ? `tags: [${workshop.tags.map(yaml).join(', ')}]` : null,
    parts.length > 1 ? `days: ${parts.length}` : null,
    `duration: ${formatDuration(minutes, { spaced: true })}`,
    '---',
    '',
  ]
    .filter((line) => line !== null)
    .join('\n')
}

const finish = (out: string[]) =>
  out
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n'

function renderTable(
  day: DayDoc,
  rows: ReturnType<typeof flattenDay>,
  schedule: ReturnType<typeof computeSchedule>,
  opts: Opts,
): string {
  const t = translator(opts.locale, 'export')
  const lines = [
    `| ${t('columns.time')} | ${t('columns.duration')} | ${t('columns.block')} | ${t('columns.info')} |`,
    '| --- | --- | --- | --- |',
  ]

  for (const row of rows) {
    const entry = schedule.entries.get(row.id)
    if (!entry) continue

    if (row.kind === 'cluster') {
      lines.push(
        `| ${formatTime(entry.startMinute, opts.locale)} | ${formatDuration(entry.durationMinutes)} | **${cell(row.cluster.title)}** | ${t('blockCount', { count: row.childCount })} |`,
      )
      continue
    }
    if (row.kind !== 'module') continue

    const type = day.moduleTypes[row.module.moduleTypeId]
    const title = row.depth === 1 ? `↳ ${cell(row.module.title)}` : cell(row.module.title)
    const people = namesOf(row.module)
    const info = [
      people ? `${t('responsible')}: ${people}` : null,
      type?.name,
      entry.conflict?.kind === 'overlap' ? t('overlap') : null,
    ]
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
  opts: Opts,
): string {
  const lines: string[] = []

  for (const row of rows) {
    const entry = schedule.entries.get(row.id)
    if (!entry) continue

    if (row.kind === 'cluster') {
      lines.push(
        '',
        `${h(opts, 2)} ${text(row.cluster.title)}`,
        `*${formatTime(entry.startMinute, opts.locale)} · ${formatDuration(entry.durationMinutes, { spaced: true })}*`,
      )
      continue
    }
    if (row.kind !== 'module') continue

    const type = day.moduleTypes[row.module.moduleTypeId]
    lines.push(
      '',
      `${h(opts, 3)} ${formatTime(entry.startMinute, opts.locale)}${entry.pinned ? ' 🔒' : ''} · ${text(row.module.title)}`,
      `\`${formatDuration(entry.durationMinutes)}\`${type ? ` · ${type.name}` : ''}`,
    )
    const people = namesOf(row.module)
    if (people) {
      lines.push('', `**${translator(opts.locale, 'export')('responsible')}:** ${text(people)}`)
    }
    lines.push(...describeModule(row.module.desc, type, opts))
  }

  return lines.join('\n')
}

function renderDetails(
  day: DayDoc,
  rows: ReturnType<typeof flattenDay>,
  schedule: ReturnType<typeof computeSchedule>,
  opts: Opts,
): string {
  const lines: string[] = []

  for (const row of rows) {
    if (row.kind !== 'module') continue
    const body = describeModule(row.module.desc, day.moduleTypes[row.module.moduleTypeId], opts)
    if (body.length === 0) continue

    const entry = schedule.entries.get(row.id)
    lines.push(
      '',
      `${h(opts, 3)} ${entry ? formatTime(entry.startMinute, opts.locale) + ' · ' : ''}${text(row.module.title)}`,
      ...body,
    )
  }

  return lines.length > 0
    ? [`${h(opts, 2)} ${translator(opts.locale, 'export')('details')}`, ...lines].join('\n')
    : ''
}

/**
 * Renders a module's `desc`, labelling its fields from the type's own schema.
 *
 * Rich text becomes Markdown, arrays become comma lists, scalars become a
 * labelled line. Everything else is skipped.
 *
 * The labels used to be a table in this file, next to a second table for enum
 * values. The comment there said they belonged in the schema and named the
 * blocker: "DayDoc carries module types without their JSON Schema". That has
 * not been true for a while -- ModuleTypeDto.jsonSchema is declared in
 * domain/agenda/types.ts and filled in loadDay -- and the two tables had
 * quietly disagreed with the inspector in the meantime.
 *
 * So both are gone, and this reads the same FieldSpec[] the inspector renders.
 * Which also means a TENANT-DEFINED type exports with its real labels for the
 * first time, rather than with `key.replaceAll('_', ' ')` -- something this
 * function's own docstring already claimed.
 */
function describeModule(
  desc: Record<string, unknown>,
  type: ModuleTypeDto | undefined,
  opts: Required<ExportOptions>,
): string[] {
  const t = translator(opts.locale, 'export')
  const lines: string[] = []
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
      const items = raw
        .filter((v): v is string => typeof v === 'string')
        .map((item) => value(key, item))
      if (items.length > 0) lines.push('', `**${label(key)}:** ${items.join(', ')}`)
      return
    }
    if (typeof raw === 'string' && raw.trim() !== '') {
      lines.push('', `**${label(key)}:** ${value(key, raw)}`)
      return
    }
    if (typeof raw === 'number') {
      lines.push('', `**${label(key)}:** ${raw}`)
    } else if (typeof raw === 'boolean') {
      lines.push('', `**${label(key)}:** ${raw ? t('yes') : t('no')}`)
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

/**
 * Who answers for a block, by name.
 *
 * Without the "external" mark the screen carries: an export is most often
 * handed to people outside the workspace, for whom that distinction is the
 * workspace's business rather than theirs.
 */
const namesOf = (mod: DayDoc['modules'][number]) =>
  (mod.responsible ?? []).map((person) => person.name).join(', ')

function contentSplit(day: DayDoc, locale: Locale): string {
  let content = 0
  let breaks = 0
  for (const mod of day.modules) {
    const type = day.moduleTypes[mod.moduleTypeId]
    if (type?.countsAsContent === false) breaks += mod.durationMinutes
    else content += mod.durationMinutes
  }
  return translator(locale, 'export')('split', {
    content: formatDuration(content, { spaced: true }),
    breaks: formatDuration(breaks, { spaced: true }),
  })
}
