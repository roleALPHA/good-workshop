'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import type { ModuleDto, ModuleTypeDto } from '@/domain/agenda/types'
import { ROW_FIELDS, isVisible, parseSchema } from '@/domain/moduleType/profile'
import { validateModuleDesc, type FieldError } from '@/domain/moduleType/validate'
import type { Translate } from '@/i18n/translator'
import { Field } from './fields'

/**
 * A module's type-specific fields, edited inline inside its own row.
 *
 * No dialog and no save button: the fields are simply there once the row is
 * expanded, and a valid change is handed upwards on blur. A modal would put a
 * mode between the facilitator and the agenda they are reading, and the whole
 * point of this editor is that the document stays visible while you work on it.
 *
 * The calm of the collapsed table is what makes that affordable. A closed row
 * shows only what is consulted while the workshop runs -- time, duration,
 * title, description, participation format, material, the start-time lock --
 * plus any field the type flags as `summary`. Everything else appears when
 * asked for and folds away again.
 */

export type ModuleDetailsProps = {
  module: ModuleDto
  type: (ModuleTypeDto & { jsonSchema?: unknown }) | undefined
  onChange: (desc: Record<string, unknown>) => void
}

export function ModuleDetails({ module: mod, type, onChange }: ModuleDetailsProps) {
  const t = useTranslations('errors.field')
  const tAgenda = useTranslations('agenda')
  const [values, setValues] = useState<Record<string, unknown>>(mod.desc)
  const [errors, setErrors] = useState<Record<string, string>>({})

  /**
   * What `commit` reads, written synchronously by `update`.
   *
   * `commit` hangs off the wrapper's blur, and a field that commits on its own
   * blur -- the tag field does -- speaks during the same bubbling focusout.
   * State queued by that field has not been applied yet, so a `commit` reading
   * the render snapshot would write the values from before it spoke and the
   * document would echo the old value straight back. A ref is the only thing
   * both handlers can see within one dispatch.
   */
  const valuesRef = useRef(mod.desc)
  /** True while this panel holds an edit the document has not been told about. */
  const dirtyRef = useRef(false)

  // The whole schema, for working out which stored values no longer have a
  // field -- a value the row edits is not an orphan just because this panel
  // does not show it.
  const schema = useMemo(() => parseSchema(type?.jsonSchema), [type?.jsonSchema])

  // What this panel renders: everything the row does not already edit in place.
  const groups = useMemo(
    () =>
      schema
        .map((group) => ({
          ...group,
          fields: group.fields.filter((field) => !ROW_FIELDS.includes(field.key)),
        }))
        .filter((group) => group.fields.length > 0),
    [schema],
  )

  // Adopt changes that arrived from elsewhere -- another tab, a collaborator,
  // an undo -- without discarding what is being typed here. `mod.desc` is a
  // fresh object on every document revision even when nothing in it changed,
  // so the dirty flag rather than the dependency list is what protects an
  // edit in progress.
  useEffect(() => {
    if (dirtyRef.current) return
    valuesRef.current = mod.desc
    setValues(mod.desc)
  }, [mod.id, mod.desc])

  // A different module in the same panel starts clean, whatever the last one
  // left behind.
  useEffect(() => {
    dirtyRef.current = false
  }, [mod.id])

  function update(key: string, value: unknown) {
    const next = { ...valuesRef.current }
    // Undefined means "not set". Leaving the key in place with an undefined
    // value fails `additionalProperties: false` on the way out.
    if (value === undefined) delete next[key]
    else next[key] = value

    valuesRef.current = next
    dirtyRef.current = true
    setValues(next)

    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  /**
   * Commits on blur rather than on every keystroke.
   *
   * Validating mid-word would flag half-typed values as wrong, and persisting
   * every character would turn one sentence into forty writes.
   */
  function commit() {
    if (!type) return
    if (!dirtyRef.current) return

    const pending = valuesRef.current

    let result: ReturnType<typeof validateModuleDesc>
    try {
      result = validateModuleDesc(
        // The real version, not a guess: it is half the validator cache's key,
        // and a wrong one silently validates against a schema that has since
        // been replaced.
        { id: type.id, schemaVersion: type.schemaVersion ?? 1, jsonSchema: type.jsonSchema },
        pending,
      )
    } catch {
      // The validator itself failed -- a schema it cannot compile, or an
      // environment that will not let it. Whatever the reason, the person
      // typed something and pressed on; dropping their input on the floor is
      // the one response that is certainly wrong, and it is silent.
      setErrors({})
      dirtyRef.current = false
      onChange(pending)
      return
    }

    if (!result.ok) {
      // Cast to the loose shape: the key is chosen at runtime from
      // FieldErrorKey, and next-intl's typed signature wants the union of every
      // message's arguments at once. src/i18n/catalogs.test.ts is what checks
      // these keys exist -- in all four languages, which the type cannot.
      //
      // Stays dirty on purpose: the value was not handed up, so the document
      // still holds the old one and must not be allowed to overwrite the text
      // the person is about to correct.
      setErrors(firstErrorPerField(result.errors, t as unknown as Translate))
      return
    }

    setErrors({})
    // Ajv fills defaults, so what was validated is not always what goes out.
    valuesRef.current = result.value
    dirtyRef.current = false
    onChange(result.value)
  }

  const orphans = useMemo(() => {
    const known = new Set(schema.flatMap((g) => g.fields.map((f) => f.key)))
    return Object.entries(values).filter(([key]) => !known.has(key))
  }, [schema, values])

  if (groups.length === 0 && orphans.length === 0) {
    return <p className="text-[15px] text-[var(--fg-muted)]">{tAgenda('noFields')}</p>
  }

  return (
    <div onBlur={commit}>
      {groups.map((group) => {
        const visible = group.fields.filter((field) => isVisible(field, values))
        if (visible.length === 0) return null

        return (
          <section key={group.name} className="mb-5 last:mb-0">
            <h4 className="mb-2 text-[12px] font-semibold tracking-wide text-[var(--fg-subtle)] uppercase">
              {group.name}
            </h4>
            <div className="grid grid-cols-12 gap-x-3 gap-y-4">
              {visible.map((field) => (
                <Field
                  key={field.key}
                  field={field}
                  value={values[field.key]}
                  error={errors[field.key]}
                  onChange={(value) => update(field.key, value)}
                />
              ))}
            </div>
          </section>
        )
      })}

      {orphans.length > 0 && <LegacyFields entries={orphans} />}
    </div>
  )
}

/**
 * Values whose field the current schema no longer declares.
 *
 * Shown rather than dropped: a module type edited last week must not make
 * somebody's notes silently invisible. Read-only, because the schema no longer
 * describes how to edit them.
 */
function LegacyFields({ entries }: { entries: [string, unknown][] }) {
  const t = useTranslations('agenda')
  return (
    <details className="mt-4 rounded border border-[var(--border)] bg-[var(--surface-raised)] p-3">
      <summary className="cursor-pointer text-[14px] font-medium">
        {t('field.legacyHeading', { count: entries.length })}
      </summary>
      <p className="mt-1 text-[13px] text-[var(--fg-muted)]">{t('field.legacyHint')}</p>
      <dl className="mt-2 space-y-1">
        {entries.map(([key, value]) => (
          <div key={key} className="text-[14px]">
            <dt className="inline font-medium">{key}: </dt>
            <dd className="inline text-[var(--fg-muted)]">
              {typeof value === 'string' ? value : JSON.stringify(value)}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

/**
 * One complaint per field: four messages about one input is noise.
 *
 * The validator hands back keys rather than sentences -- the same list also
 * goes to a server action and to an MCP client, which need different languages
 * -- so rendering happens here, where the person's own language is known.
 */
function firstErrorPerField(errors: FieldError[], t: Translate): Record<string, string> {
  const map: Record<string, string> = {}
  for (const error of errors) map[error.path] ??= t(error.messageKey, error.params)
  return map
}
