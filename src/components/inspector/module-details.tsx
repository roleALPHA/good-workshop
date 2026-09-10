'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ModuleDto, ModuleTypeDto } from '@/domain/agenda/types'
import { isVisible, parseSchema } from '@/domain/moduleType/profile'
import { validateModuleDesc, type FieldError } from '@/domain/moduleType/validate'
import { Field } from './fields'

/**
 * A module's type-specific fields, edited inline inside its own row.
 *
 * No dialog and no save button: the fields are simply there once the row is
 * expanded, and a valid change is handed upwards on blur. A modal would put a
 * mode between the facilitator and the agenda they are reading, and the whole
 * point of this editor is that the document stays visible while you work on it.
 *
 * The calm of the collapsed table is what makes that affordable. Only four
 * fields show while a row is closed -- time, duration, title, description --
 * plus any field the type flags as `summary`. Everything else appears when
 * asked for and folds away again.
 */

export type ModuleDetailsProps = {
  module: ModuleDto
  type: (ModuleTypeDto & { jsonSchema?: unknown }) | undefined
  onChange: (desc: Record<string, unknown>) => void
}

export function ModuleDetails({ module: mod, type, onChange }: ModuleDetailsProps) {
  const [values, setValues] = useState<Record<string, unknown>>(mod.desc)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const groups = useMemo(() => parseSchema(type?.jsonSchema), [type?.jsonSchema])

  // Adopt changes that arrived from elsewhere -- another tab, a collaborator,
  // an undo -- without discarding what is being typed here.
  useEffect(() => {
    setValues(mod.desc)
  }, [mod.id, mod.desc])

  function update(key: string, value: unknown) {
    setValues((current) => {
      const next = { ...current }
      // Undefined means "not set". Leaving the key in place with an undefined
      // value fails `additionalProperties: false` on the way out.
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })

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

    const result = validateModuleDesc(
      { id: type.id, schemaVersion: 1, jsonSchema: type.jsonSchema },
      values,
    )

    if (!result.ok) {
      setErrors(firstErrorPerField(result.errors))
      return
    }

    setErrors({})
    onChange(result.value)
  }

  const orphans = useMemo(() => {
    const known = new Set(groups.flatMap((g) => g.fields.map((f) => f.key)))
    return Object.entries(values).filter(([key]) => !known.has(key))
  }, [groups, values])

  if (groups.length === 0 && orphans.length === 0) {
    return (
      <p className="text-[15px] text-[var(--fg-muted)]">
        Dieser Modultyp hat keine weiteren Felder.
      </p>
    )
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
  return (
    <details className="mt-4 rounded border border-[var(--border)] bg-[var(--surface-raised)] p-3">
      <summary className="cursor-pointer text-[14px] font-medium">
        Alte Felder ({entries.length})
      </summary>
      <p className="mt-1 text-[13px] text-[var(--fg-muted)]">
        Diese Angaben stammen aus einer früheren Fassung dieses Modultyps. Sie bleiben erhalten,
        lassen sich aber nicht mehr bearbeiten.
      </p>
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

/** One complaint per field: four messages about one input is noise. */
function firstErrorPerField(errors: FieldError[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const error of errors) map[error.path] ??= error.message
  return map
}
