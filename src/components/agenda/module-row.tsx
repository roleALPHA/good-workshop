import { ChevronDown, Inbox, NotebookPen, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ModuleDto, ModuleTypeDto } from '@/domain/agenda/types'
import type { ScheduleEntry } from '@/domain/schedule/types'
import { setDescField, stringList } from '@/domain/moduleType/desc'
import { findField, parseSchema, summaryChips } from '@/domain/moduleType/profile'
import type { SummaryChip } from '@/domain/moduleType/profile'
import { catClass } from '@/lib/category-colors'
import { cn } from '@/lib/cn'
import { isRichTextValue } from '@/lib/richtext/schema'
import { toPlainText } from '@/lib/richtext/plain'
import { RichText } from '@/lib/richtext/render'
import { resolveResponsible, type AssignablePerson } from '@/domain/agenda/responsible'
import { ChipsInput } from './chips-input'
import { ParticipationBadge, ParticipationControl } from './participation-control'
import { ResponsibleInput, ResponsibleList } from './responsible'
import { PeerMarks } from './presence'
import { DescriptionInput, TitleInput } from './inline-inputs'
import { OverlapWarning, TimeCell } from './time-cell'
import { GRID, type RowChrome, type RowEditing } from './agenda-rows'

/**
 * One block of the agenda.
 *
 * The same markup serves three readers: the editor, the print view and the
 * reading view on a phone. `editing` is what separates them -- passed by the
 * editor, left out by the other two, which get the identical row read-only. That
 * is the inline-editing rule of docs/ui-conventions.md taken literally: there is
 * no second, simpler row to fall out of step with this one.
 *
 * The chips below the title are the block type's own summary fields, so a break
 * and a group exercise show what each of them actually has.
 */

export function ModuleRow({
  module: mod,
  type,
  entry,
  nested,
  chrome,
  editing,
  people,
}: {
  module: ModuleDto
  type: ModuleTypeDto | undefined
  entry: ScheduleEntry
  nested: boolean
  chrome?: RowChrome
  editing?: RowEditing
  /** The workspace's members, to show them under their current names. */
  people?: AssignablePerson[]
}) {
  const t = useTranslations('agenda')
  const description = isRichTextValue(mod.desc.description) ? mod.desc.description : null

  const groups = parseSchema(type?.jsonSchema)
  // Both are offered only where the type actually declares them. A control for
  // a field the schema does not know would write a value that
  // `additionalProperties: false` rejects on the way to the database -- and the
  // editor would go on showing it.
  const participation = findField(groups, 'participation')
  const descriptionField = findField(groups, 'description')
  const materialField = findField(groups, 'materials')
  const materials = stringList(mod.desc.materials)
  // Material has its own control in the editor, so it must not also arrive as
  // a read-only chip beside it.
  const info = summaryChips(groups, mod.desc, editing ? ['materials'] : [])
  const hasNotes = hasFacilitatorNotes(mod)

  const writeDesc = (key: string, value: unknown) =>
    editing?.onDescChange(setDescField(mod.desc, key, value))

  const titleId = `module-title-${mod.id}`

  return (
    <article
      ref={chrome?.rootRef}
      style={chrome?.style}
      aria-labelledby={titleId}
      data-block-id={mod.id}
      className={cn(
        catClass(type?.color),
        'group relative break-inside-avoid border-b border-[var(--border)]',
        chrome?.isDragging && 'opacity-40',
        GRID,
      )}
    >
      {chrome?.handle}
      {chrome?.presence ? <PeerMarks peers={chrome.presence} /> : null}
      {/* Phone: the category bar is the card's left edge. */}
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-1 bg-[var(--cat-bar)] md:hidden"
        style={nested ? { left: '0.75rem' } : undefined}
      />

      <span className="hidden md:block" />

      <div className={cn('pt-3 pb-3 pl-4 md:px-2 md:pl-2', nested && 'pl-7 md:pl-2')}>
        <TimeCell
          entry={entry}
          editing={editing && { ...editing, pinnedStartMinute: mod.pinnedStartMinute }}
        >
          {participation &&
            (editing ? (
              <ParticipationControl
                field={participation}
                value={
                  typeof mod.desc.participation === 'string' ? mod.desc.participation : undefined
                }
                onChange={(value) => writeDesc('participation', value)}
              />
            ) : (
              <ParticipationBadge
                field={participation}
                value={
                  typeof mod.desc.participation === 'string' ? mod.desc.participation : undefined
                }
              />
            ))}
        </TimeCell>
      </div>

      <span className="hidden md:block" />

      <div
        className={cn(
          'pb-3 pl-4 md:border-l-4 md:border-[var(--cat-bar)] md:px-3 md:pt-3 md:pl-3',
          nested && 'pl-7 md:ml-7 md:pl-3',
        )}
      >
        {editing ? (
          <h3 id={titleId}>
            <TitleInput value={mod.title} onCommit={editing.onTitleChange} />
          </h3>
        ) : (
          <h3 id={titleId} className="font-semibold text-[var(--fg)]">
            {mod.title}
          </h3>
        )}
        {/*
          Straight under the title, before the description: "whose is this?" is
          asked of every row, and a closed row answers it without a click.
        */}
        {editing?.onResponsibleChange ? (
          <div className="mt-0.5 mb-1">
            <ResponsibleInput
              value={mod.responsible}
              people={people}
              onChange={editing.onResponsibleChange}
            />
          </div>
        ) : (
          <ResponsibleList
            people={resolveResponsible(mod.responsible, people)}
            className="mt-1 mb-1"
          />
        )}
        {editing && descriptionField ? (
          <>
            <DescriptionInput
              value={description}
              label={descriptionField.label}
              onCommit={(value) => writeDesc('description', value)}
              className="hidden lg:block"
            />
            {description && (
              <RichText
                value={description}
                className="mt-1 text-[15px] text-[var(--fg-muted)] lg:hidden"
              />
            )}
          </>
        ) : (
          description && (
            <RichText value={description} className="mt-1 text-[15px] text-[var(--fg-muted)]" />
          )
        )}
        {type && <p className="mt-0.5 text-[13px] text-[var(--cat-fg)] md:hidden">{type.name}</p>}
        {entry.conflict?.kind === 'overlap' && <OverlapWarning minutes={entry.conflict.minutes} />}

        {editing && (
          <>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={editing.onToggleExpanded}
                aria-expanded={editing.expanded}
                aria-controls={`details-${mod.id}`}
                className="mt-1.5 -ml-1 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[13px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
              >
                <ChevronDown
                  aria-hidden
                  className={cn('size-3.5 transition-transform', editing.expanded && 'rotate-180')}
                />
                {editing.expanded ? t('fewerFields') : t('moreFields')}
              </button>

              {/*
                Editor only. The field is the facilitator's own ("nur für
                dich"), and the read-only table is what a participant is handed
                -- a marker there would announce that private notes exist.
              */}
              {hasNotes && !editing.expanded && (
                <button
                  type="button"
                  onClick={editing.onToggleExpanded}
                  aria-controls={`details-${mod.id}`}
                  aria-expanded={editing.expanded}
                  title={t('notes')}
                  aria-label={t('notes')}
                  className="mt-1.5 inline-flex items-center rounded px-1 py-0.5 text-[var(--fg-subtle)] hover:bg-[var(--surface-raised)] hover:text-[var(--fg-muted)]"
                >
                  <NotebookPen aria-hidden className="size-3.5" />
                </button>
              )}

              {editing.onPark && (
                <button
                  type="button"
                  onClick={editing.onPark}
                  aria-label={t('parkLabel', { title: mod.title })}
                  title={t('parkHint')}
                  className="mt-1.5 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[13px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)]"
                >
                  <Inbox aria-hidden className="size-3.5" />
                  {t('park')}
                </button>
              )}

              {editing.onRemove && (
                <button
                  type="button"
                  onClick={editing.onRemove}
                  aria-label={t('deleteLabel', { title: mod.title })}
                  title={t('deleteHint')}
                  className="mt-1.5 inline-flex items-center gap-1 rounded px-1 py-0.5 text-[13px] text-[var(--fg-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--danger-fg)]"
                >
                  <Trash2 aria-hidden className="size-3.5" />
                  {t('delete')}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className={cn('space-y-1 pb-3 pl-4 md:px-3 md:pt-3 md:pl-3', nested && 'pl-7 md:pl-3')}>
        {info.length > 0 && <InfoChips items={info} />}
        {editing && materialField && (
          <ChipsInput
            values={materials}
            onChange={(next) => writeDesc('materials', next.length > 0 ? next : undefined)}
            addLabel={t('materials.add')}
            removeLabel={(name) => t('materials.remove', { name })}
            editLabel={(name) => t('materials.edit', { name })}
            editFieldLabel={(name) => t('materials.editField', { name })}
            placeholder={t('materials.placeholder')}
          />
        )}
      </div>

      <span className="hidden md:block" />

      {/*
        A child of the ROW's grid, spanning all of it, rather than a child of the
        title cell.
        Inside that cell the panel was as wide as one column: on a desktop window
        a full-width text field stopped halfway across while the column beside it
        stayed empty. The fields lay themselves out on twelve columns, and they
        can only use them if they are given the width.
      */}
      {editing?.expanded && (
        <div
          id={`details-${mod.id}`}
          className={cn(
            'mb-3 ml-4 rounded border border-[var(--border)] bg-[var(--surface-raised)] p-3',
            'md:col-span-full md:mr-3 md:ml-3',
            nested && 'ml-7 md:ml-10',
          )}
        >
          {editing.details}
        </div>
      )}
    </article>
  )
}

function InfoChips({ items }: { items: SummaryChip[] }) {
  return (
    <ul className="flex flex-wrap gap-1">
      {items.map((item) => (
        <li
          key={`${item.key}:${item.text}`}
          // The field's own name, so a chip reading "Mira" is not a riddle for
          // anyone using a screen reader.
          title={item.label}
          className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[13px] text-[var(--fg-muted)]"
        >
          <span className="sr-only">{item.label}: </span>
          {item.text}
        </li>
      ))}
    </ul>
  )
}

/**
 * Whether there is a facilitator note worth pointing at.
 *
 * An empty rich-text document is still a document, so the text has to be
 * looked at rather than the key.
 */
function hasFacilitatorNotes(mod: ModuleDto): boolean {
  const notes = mod.desc.facilitator_notes
  return isRichTextValue(notes) && toPlainText(notes).trim() !== ''
}
