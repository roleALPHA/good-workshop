'use client'

import { useState } from 'react'
import {
  saveMailSettings,
  sendTestMail,
  type MailSettingsView,
} from '@/server/actions/mail-settings'
import { useTranslations } from 'next-intl'

const field =
  'mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[15px] disabled:opacity-60'

/** Values only: the label and the hint for each live in the catalog. */
const TRANSPORTS = ['graph', 'smtp', 'console', 'none'] as const

export function MailForm({ initial }: { initial: MailSettingsView }) {
  const t = useTranslations('admin.mail')
  const tc = useTranslations('common')
  const tTransport = useTranslations('admin.mail.transport')
  const [view, setView] = useState(initial)
  const [transport, setTransport] = useState<string>(initial.transport)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, setPending] = useState(false)

  /** A field the environment dictates is shown, not hidden -- and not editable,
   *  because a form that accepts a value it will ignore is worse than a lock. */
  const fixed = (name: string) => view.fromEnvironment.includes(name)

  async function save(formData: FormData) {
    setPending(true)
    setSaved(false)
    setError(null)
    try {
      const result = await saveMailSettings(formData)
      if (result.ok) {
        setView(result.data)
        setTransport(result.data.transport)
        setSaved(true)
      } else {
        setError(result.message)
      }
    } finally {
      setPending(false)
    }
  }

  async function runTest(formData: FormData) {
    setPending(true)
    setTest(null)
    try {
      const result = await sendTestMail(formData)
      setTest(
        result.ok
          ? { ok: true, text: t('testSent', { email: result.data }) }
          : { ok: false, text: result.message },
      )
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      {view.fromEnvironment.length > 0 && (
        <p className="mt-4 rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[14px] text-[var(--fg-muted)]">
          {t.rich('fromEnvironmentNotice', { code: (chunks) => <code>{chunks}</code> })}
        </p>
      )}

      <form action={save} className="mt-6 space-y-6">
        <fieldset>
          <legend className="text-[14px] font-medium">{t('transportLegend')}</legend>
          <div className="mt-2 space-y-2">
            {TRANSPORTS.map((option) => (
              <label key={option} className="flex gap-3">
                <input
                  type="radio"
                  name="transport"
                  value={option}
                  checked={transport === option}
                  disabled={fixed('transport')}
                  onChange={(event) => setTransport(event.target.value)}
                  className="mt-1"
                />
                <span>
                  <span className="text-[15px] font-medium">{tTransport(option)}</span>
                  <span className="block text-[13px] text-[var(--fg-subtle)]">
                    {tTransport(`${option}Hint`)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {transport === 'graph' && (
          <div className="space-y-4 border-l-2 border-[var(--border)] pl-4">
            <p className="text-[13px] text-[var(--fg-subtle)]">
              {t.rich('graphIntro', {
                b: (chunks) => <strong>{chunks}</strong>,
                code: (chunks) => <code>{chunks}</code>,
              })}
            </p>
            <Text
              name="graphTenantId"
              label={t('graphTenantId')}
              value={view.graphTenantId}
              disabled={fixed('graphTenantId')}
            />
            <Text
              name="graphClientId"
              label={t('graphClientId')}
              value={view.graphClientId}
              disabled={fixed('graphClientId')}
            />
            <Secret
              name="graphClientSecret"
              label={t('graphClientSecret')}
              stored={view.hasGraphClientSecret}
              disabled={fixed('graphClientSecret')}
            />
            <Text
              name="graphSender"
              label={t('graphSender')}
              value={view.graphSender}
              disabled={fixed('graphSender')}
            />
          </div>
        )}

        {transport === 'smtp' && (
          <div className="space-y-4 border-l-2 border-[var(--border)] pl-4">
            <Secret
              name="smtpUrl"
              label={t('smtpUrl')}
              hint={t('smtpUrlHint')}
              stored={view.hasSmtpUrl}
              disabled={fixed('smtpUrl')}
            />
            <Text
              name="smtpFrom"
              label={t('smtpFrom')}
              value={view.smtpFrom}
              disabled={fixed('smtpFrom')}
            />
          </div>
        )}

        {error && (
          <p role="alert" className="text-[14px] text-[var(--warn-fg)]">
            {error}
          </p>
        )}
        {saved && <p className="text-[14px] text-[var(--fg-muted)]">{t('saved')}</p>}

        <button
          type="submit"
          disabled={pending}
          className="rounded bg-[var(--brand)] px-4 py-2 text-[15px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60"
        >
          {tc('save')}
        </button>
      </form>

      <form action={runTest} className="mt-10 border-t border-[var(--border)] pt-6">
        <h2 className="text-[15px] font-medium">{t('testTitle')}</h2>
        <p className="mt-1 text-[13px] text-[var(--fg-subtle)]">{t('testIntro')}</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="test-to" className="text-[14px] font-medium">
              {t('testTo')}
            </label>
            <input id="test-to" name="to" type="email" required className={field} />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded border border-[var(--border)] px-4 py-2 text-[15px] disabled:opacity-60"
          >
            {t('testSend')}
          </button>
        </div>
        {test && (
          <p
            role="alert"
            className={`mt-3 text-[14px] ${test.ok ? 'text-[var(--fg-muted)]' : 'text-[var(--warn-fg)]'}`}
          >
            {test.text}
          </p>
        )}
      </form>
    </>
  )
}

function Text({
  name,
  label,
  value,
  disabled,
}: {
  name: string
  label: string
  value: string
  disabled: boolean
}) {
  return (
    <div>
      <label htmlFor={name} className="text-[14px] font-medium">
        {label}
        {disabled && <Fixed />}
      </label>
      <input id={name} name={name} defaultValue={value} disabled={disabled} className={field} />
    </div>
  )
}

/** Never prefilled: the stored value does not travel to the browser, so a blank
 *  field means "unchanged" rather than "empty". */
function Secret({
  name,
  label,
  hint,
  stored,
  disabled,
}: {
  name: string
  label: string
  hint?: string
  stored: boolean
  disabled: boolean
}) {
  const t = useTranslations('admin.mail')
  return (
    <div>
      <label htmlFor={name} className="text-[14px] font-medium">
        {label}
        {disabled && <Fixed />}
      </label>
      <input
        id={name}
        name={name}
        type="password"
        autoComplete="off"
        disabled={disabled}
        placeholder={stored ? t('secretStored') : ''}
        className={field}
      />
      {hint && <p className="mt-1 text-[13px] text-[var(--fg-subtle)]">{hint}</p>}
    </div>
  )
}

function Fixed() {
  const t = useTranslations('admin.mail')
  return (
    <span className="ml-2 rounded bg-[var(--bg)] px-1.5 py-0.5 text-[12px] font-normal text-[var(--fg-subtle)]">
      {t('fromEnvironment')}
    </span>
  )
}
