'use client'

import { useMemo, useState } from 'react'
import type { FieldSpec } from '@/domain/moduleType/profile'
import { cn } from '@/lib/cn'
import { RichText } from '@/lib/richtext/render'
import { fitsMarkdown, markdownToRichText, richTextToMarkdown } from '@/lib/richtext/markdown'
import { isRichTextValue, type RichTextValue } from '@/lib/richtext/schema'
import { useTranslations } from 'next-intl'

/**
 * One widget per supported type, and nothing more.
 *
 * The profile is small on purpose, so this stays a switch over eight cases
 * instead of a templating system. Anything the profile cannot describe is not
 * rendered at all -- a field shown as the wrong control is worse than a field
 * that is missing, because it silently writes the wrong shape.
 */

export type FieldProps = {
  field: FieldSpec
  value: unknown
  error?: string
  onChange: (value: unknown) => void
}

const inputClass =
  'w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-1.5 text-[16px] focus-visible:border-[var(--brand-ring)]'

export function Field({ field, value, error, onChange }: FieldProps) {
  const t = useTranslations('agenda')
  const id = `field-${field.key}`

  return (
    <div style={{ gridColumn: `span ${field.cols} / span ${field.cols}` }}>
      <label htmlFor={id} className="block text-[14px] font-medium">
        {field.label}
        {field.required && (
          <span aria-hidden className="ml-0.5 text-[var(--danger-fg)]">
            *
          </span>
        )}
        {field.private && (
          <span className="ml-2 text-[12px] font-normal text-[var(--fg-subtle)]">
            {t('field.privateNote')}
          </span>
        )}
      </label>

      {field.help && <p className="mt-0.5 text-[13px] text-[var(--fg-muted)]">{field.help}</p>}

      <div className="mt-1">
        <Widget id={id} field={field} value={value} onChange={onChange} invalid={!!error} />
      </div>

      {error && (
        <p role="alert" className="mt-1 text-[13px] text-[var(--danger-fg)]">
          {error}
        </p>
      )}
    </div>
  )
}

function Widget({
  id,
  field,
  value,
  onChange,
  invalid,
}: FieldProps & { id: string; invalid: boolean }) {
  const t = useTranslations('agenda')
  const klass = cn(inputClass, invalid && 'border-[var(--danger-fg)]')

  switch (field.widget) {
    case 'richtext':
      return <RichTextField id={id} value={value} onChange={onChange} className={klass} />

    case 'textarea':
      return (
        <textarea
          id={id}
          rows={4}
          className={klass}
          value={typeof value === 'string' ? value : ''}
          maxLength={field.maxLength}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      )

    case 'number':
      return (
        <input
          id={id}
          type="number"
          inputMode="numeric"
          className={klass}
          min={field.min}
          max={field.max}
          value={typeof value === 'number' ? value : ''}
          // An empty field is "not set", not zero: writing 0 would make the
          // schema's own minimum reject a field the user simply cleared.
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        />
      )

    case 'checkbox':
      return (
        <input
          id={id}
          type="checkbox"
          className="size-5 rounded border-[var(--border-strong)]"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked || undefined)}
        />
      )

    case 'select':
      return (
        <select
          id={id}
          className={klass}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">{t('field.unset')}</option>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )

    case 'tags':
      return <TagsField id={id} value={value} onChange={onChange} className={klass} />

    case 'url':
      return (
        <input
          id={id}
          type="url"
          inputMode="url"
          placeholder="https://"
          className={klass}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      )

    default:
      return (
        <input
          id={id}
          type="text"
          className={klass}
          maxLength={field.maxLength}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      )
  }
}

/**
 * Rich text as Markdown, the way the row edits the description.
 *
 * The small dialect in `markdown.ts` mirrors the rich text allowlist, so a
 * list or a bold word survives the round trip. Only a document with a node or
 * mark outside it -- which the dialect would drop -- is shown read-only: never
 * silently flatten what somebody wrote.
 *
 * A local draft that commits on blur, like TagsField and for the same reason:
 * parsing on every keystroke would renumber a list and swallow a half-typed
 * `- ` while the person is still writing it.
 */
function RichTextField({
  id,
  value,
  onChange,
  className,
}: {
  id: string
  value: unknown
  onChange: (value: unknown) => void
  className: string
}) {
  const t = useTranslations('agenda')
  const rich: RichTextValue | null = isRichTextValue(value) ? value : null
  const source = rich ? editableMarkdown(rich) : ''
  const [draft, setDraft] = useState(source)

  // Adopt a value that changed elsewhere, compared as text -- see TagsField.
  const [seen, setSeen] = useState(source)
  if (source !== seen) {
    setSeen(source)
    setDraft(source)
  }

  if (rich && !fitsMarkdown(rich)) {
    return (
      <div className="rounded border border-[var(--border)] bg-[var(--surface-raised)] p-2.5">
        <RichText value={rich} className="text-[15px]" />
        <p className="mt-2 text-[13px] text-[var(--fg-muted)]">{t('field.richTextReadOnly')}</p>
      </div>
    )
  }

  return (
    <textarea
      id={id}
      rows={4}
      className={className}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim()
        if (next === source.trim()) return
        onChange(next === '' ? undefined : markdownToRichText(next))
      }}
    />
  )
}

const editableMarkdown = (value: RichTextValue) =>
  richTextToMarkdown(value).replaceAll('  \n', '\n')

/**
 * Comma- or newline-separated entry; chips on the way out.
 *
 * Controlled, with a local draft, for the same reason TitleInput is: an
 * uncontrolled box never hears a value that arrives from a collaborator or an
 * undo. And it commits the draft it is holding rather than leaving the panel's
 * blur handler to read it out of state later -- React's blur bubbles, so the
 * panel would commit the snapshot from before this field spoke, and Material
 * would round-trip back to what it was.
 */
function TagsField({
  id,
  value,
  onChange,
  className,
}: {
  id: string
  value: unknown
  onChange: (value: unknown) => void
  className: string
}) {
  const t = useTranslations('agenda')
  const items = useMemo(
    () => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []),
    [value],
  )
  const text = items.join(', ')
  const [draft, setDraft] = useState(text)

  // Adopt a value that changed elsewhere. Keyed on the joined text rather than
  // on the array, which is a fresh identity on every document revision and
  // would wipe out half-typed input on every keystroke of a collaborator.
  //
  // During render rather than in an effect -- see the note in search-box.tsx.
  // The comparison above is what makes that safe: it is a string, not an
  // identity.
  const [seen, setSeen] = useState(text)
  if (text !== seen) {
    setSeen(text)
    setDraft(text)
  }

  return (
    <div>
      <input
        id={id}
        type="text"
        className={className}
        placeholder={t('field.commaSeparated')}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = draft
            .split(/[,\n]/)
            .map((part) => part.trim())
            .filter(Boolean)
          onChange(next.length > 0 ? next : undefined)
        }}
      />
      {items.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1">
          {items.map((item) => (
            <li
              key={item}
              className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-0.5 text-[13px] text-[var(--fg-muted)]"
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
