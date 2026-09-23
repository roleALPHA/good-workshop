'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { LOCALES, type Locale } from '@/i18n/config'
import { saveMethodAction, setCatalogStatusAction } from '../../../actions'

type Method = {
  id: string
  key: string
  moduleTypeKey: string
  defaultDurationMinutes: number
  groupSize: string
  facets: string[]
  text: Record<
    string,
    { slug?: string | null; published?: boolean; fields?: Record<string, string> }
  >
}

/**
 * The editor. One save for the whole method, four languages included.
 *
 * Not a save per field: the function behind it writes a method as one
 * document, for the reason apply_agenda exists, and a form that saved on every
 * blur would be twenty calls where one belongs. What it does borrow from the
 * product's own rule is that nothing here is behind a dialog.
 *
 * Publishing is its own control and its own scope, because writing something
 * and making it live are different decisions. A language with no address
 * cannot be published, and the refusal comes from the database rather than
 * from a check here that could drift from it.
 */
export function MethodForm({ method }: { method: Method }) {
  const t = useTranslations('operator.discover')
  const [pending, start] = useTransition()
  const [saved, setSaved] = useState(false)
  const [failed, setFailed] = useState(false)

  const field = (locale: Locale, name: string) => method.text[locale]?.fields?.[name] ?? ''

  return (
    <form
      className="mt-5"
      action={(data) => {
        start(async () => {
          setSaved(false)
          setFailed(false)
          const result = await saveMethodAction({
            key: method.key,
            moduleTypeKey: String(data.get('moduleTypeKey') ?? ''),
            defaultDurationMinutes: String(data.get('defaultDurationMinutes') ?? '0'),
            text: Object.fromEntries(
              LOCALES.map((locale) => [
                locale,
                {
                  name: String(data.get(`${locale}.name`) ?? ''),
                  summary: String(data.get(`${locale}.summary`) ?? ''),
                  body: String(data.get(`${locale}.body`) ?? ''),
                  slug: String(data.get(`${locale}.slug`) ?? ''),
                },
              ]).filter(([, value]) => (value as { name: string }).name !== ''),
            ),
          })
          if (result.ok) setSaved(true)
          else setFailed(true)
        })
      }}
    >
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-[14px] text-[var(--fg-subtle)]">
          {t('blockType')}
          <input
            name="moduleTypeKey"
            defaultValue={method.moduleTypeKey}
            className="min-h-11 w-52 rounded border border-[var(--border)] px-2 text-[16px]"
          />
        </label>
        <label className="flex flex-col gap-1 text-[14px] text-[var(--fg-subtle)]">
          {t('duration')}
          <input
            name="defaultDurationMinutes"
            type="number"
            min={0}
            max={1440}
            defaultValue={method.defaultDurationMinutes}
            className="min-h-11 w-28 rounded border border-[var(--border)] px-2 text-[16px]"
          />
        </label>
      </div>

      {LOCALES.map((locale) => (
        <fieldset key={locale} className="mt-5 rounded border border-[var(--border)] p-3">
          <legend className="px-1 text-[14px]">
            {locale}
            {locale === 'en' && (
              <span className="ml-2 text-[var(--fg-subtle)]">— {t('source')}</span>
            )}
          </legend>

          {locale === 'en' && (
            <p className="mb-2 text-[13px] text-[var(--fg-subtle)]">{t('sourceHint')}</p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-[14px] text-[var(--fg-subtle)]">
              {t('name')}
              <input
                name={`${locale}.name`}
                defaultValue={field(locale, 'name')}
                className="min-h-11 rounded border border-[var(--border)] px-2 text-[16px]"
              />
            </label>
            <label className="flex flex-col gap-1 text-[14px] text-[var(--fg-subtle)]">
              {t('slug')}
              <input
                name={`${locale}.slug`}
                defaultValue={method.text[locale]?.slug ?? ''}
                pattern="[a-z0-9][a-z0-9-]*"
                className="min-h-11 rounded border border-[var(--border)] px-2 text-[16px]"
              />
            </label>
          </div>

          <label className="mt-3 flex flex-col gap-1 text-[14px] text-[var(--fg-subtle)]">
            {t('summary')}
            <textarea
              name={`${locale}.summary`}
              rows={3}
              defaultValue={field(locale, 'summary')}
              className="rounded border border-[var(--border)] px-2 py-1 text-[16px]"
            />
          </label>

          {/* The English text beside the field, for whoever is translating.
              Reading one and writing the other is the whole job. */}
          {locale !== 'en' && field('en', 'summary') && (
            <p className="mt-1 text-[13px] text-[var(--fg-subtle)]">
              {t('reference')}: {field('en', 'summary')}
            </p>
          )}

          <label className="mt-3 flex flex-col gap-1 text-[14px] text-[var(--fg-subtle)]">
            {t('body')}
            <textarea
              name={`${locale}.body`}
              rows={5}
              defaultValue={field(locale, 'body')}
              className="rounded border border-[var(--border)] px-2 py-1 text-[16px]"
            />
          </label>

          <Publish
            methodId={method.id}
            locale={locale}
            published={method.text[locale]?.published === true}
          />
        </fieldset>
      ))}

      <div className="mt-5 flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded bg-[var(--brand)] px-4 text-[16px] font-medium text-[var(--brand-fg)] disabled:opacity-60"
        >
          {t('save')}
        </button>
        {saved && <span className="text-[14px]">{t('saved')}</span>}
        {failed && <span className="text-[14px] text-[var(--danger-fg)]">{t('notFound')}</span>}
      </div>
    </form>
  )
}

function Publish({
  methodId,
  locale,
  published,
}: {
  methodId: string
  locale: Locale
  published: boolean
}) {
  const t = useTranslations('operator.discover')
  const [pending, start] = useTransition()
  const [refused, setRefused] = useState(false)

  return (
    <p className="mt-3 flex items-center gap-3 text-[14px]">
      <span>{published ? t('published') : t('draft')}</span>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setRefused(false)
            const result = await setCatalogStatusAction({
              kind: 'method',
              id: methodId,
              locales: [locale],
              published: !published,
            })
            if (!result.ok) setRefused(true)
          })
        }
        className="min-h-11 rounded border border-[var(--border-strong)] px-3 disabled:opacity-60"
      >
        {published ? t('unpublish') : t('publish')}
      </button>
      {/* The one refusal worth naming: a language with no address cannot be
          published, and the database is what says so. */}
      {refused && <span className="text-[var(--danger-fg)]">{t('slug')}</span>}
    </p>
  )
}
