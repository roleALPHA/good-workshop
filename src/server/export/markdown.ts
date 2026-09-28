import type { DayDoc } from '@/domain/agenda/types'
import { computeSchedule } from '@/domain/schedule/computeSchedule'
import type { Schedule } from '@/domain/schedule/types'
import { formatDuration, formatTime } from '@/features/agenda/duration'
import { dayTotals } from '@/features/agenda/totals'
import { flattenDay, toScheduleItems } from '@/features/agenda/flatten'
import { ATTRIBUTION_MARKDOWN } from '@/lib/attribution'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config'
import { translator } from '@/i18n/translator'
import { cell, describeModule, namesOf, text, yaml } from './fields'

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
    contentSplit(day, schedule, opts.locale),
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
    const title = `${'↳'.repeat(row.depth)}${row.depth > 0 ? ' ' : ''}${cell(row.module.title)}`
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

function contentSplit(day: DayDoc, schedule: Schedule, locale: Locale): string {
  const { content, breaks } = dayTotals(day, schedule)
  return translator(locale, 'export')('split', {
    content: formatDuration(content, { spaced: true }),
    breaks: formatDuration(breaks, { spaced: true }),
  })
}
