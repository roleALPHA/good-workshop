'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { LOCALES } from '@/i18n/config'
import { saveFacetAction } from '../actions'

/**
 * A new filter value, with its four labels.
 *
 * This form is the requirement made visible: a new inclusivity property has to
 * be possible without a release, and this is where that happens. Four labels
 * in one submit, because a value with an English label and three blanks would
 * render as its own key to three quarters of the readers.
 */
export function FacetForm({ groups }: { groups: string[] }) {
  const t = useTranslations('operator.discover')
  const [pending, start] = useTransition()
  const [done, setDone] = useState(false)
  const [failed, setFailed] = useState(false)

  return (
    <form
      className="mt-4 flex flex-wrap items-end gap-3 rounded border border-[var(--border)] p-3"
      action={(data) => {
        start(async () => {
          setDone(false)
          setFailed(false)
          const result = await saveFacetAction({
            group: String(data.get('group') ?? ''),
            key: String(data.get('key') ?? ''),
            text: Object.fromEntries(
              LOCALES.map((locale) => [locale, { label: String(data.get(locale) ?? '') }]).filter(
                ([, value]) => (value as { label: string }).label !== '',
              ),
            ),
          })
          if (result.ok) setDone(true)
          else setFailed(true)
        })
      }}
    >
      <label className="flex flex-col gap-1 text-[14px] text-[var(--fg-subtle)]">
        {t('filterGroup')}
        <select
          name="group"
          className="min-h-11 rounded border border-[var(--border)] px-2 text-[16px]"
        >
          {groups.map((group) => (
            <option key={group} value={group}>
              {group}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-[14px] text-[var(--fg-subtle)]">
        {t('key')}
        <input
          name="key"
          required
          pattern="[a-z][a-z0-9_]{1,48}"
          className="min-h-11 w-40 rounded border border-[var(--border)] px-2 text-[16px]"
        />
      </label>

      {LOCALES.map((locale) => (
        <label key={locale} className="flex flex-col gap-1 text-[14px] text-[var(--fg-subtle)]">
          {locale}
          <input
            name={locale}
            // English is the source; without it the fallback has nothing under it.
            required={locale === 'en'}
            className="min-h-11 w-36 rounded border border-[var(--border)] px-2 text-[16px]"
          />
        </label>
      ))}

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded border border-[var(--border-strong)] px-4 text-[15px] disabled:opacity-60"
      >
        {t('addValue')}
      </button>

      {done && <p className="text-[14px]">{t('saved')}</p>}
      {failed && <p className="text-[14px] text-[var(--danger-fg)]">{t('empty')}</p>}
    </form>
  )
}
