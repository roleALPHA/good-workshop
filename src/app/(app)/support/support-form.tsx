'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { sendSupportRequestAction } from './actions'

const field =
  'mt-1 w-full rounded border border-[var(--border-strong)] bg-[var(--surface)] px-2.5 py-2 text-[16px]'

/**
 * Subject and message, and nothing else to fill in: who is writing, from which
 * workspace and on which version, the action adds by itself.
 *
 * After sending, the form empties and says the ticket number -- that is what
 * somebody quotes when they write again.
 */
export function SupportForm() {
  const t = useTranslations('support')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function send(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await sendSupportRequestAction({ subject, message })
      if (!result.ok) {
        setSent(null)
        setError(result.message)
        return
      }
      setError(null)
      setSent(result.data.number)
      setSubject('')
      setMessage('')
    })
  }

  return (
    <form onSubmit={send} className="max-w-xl">
      <label htmlFor="support-subject" className="text-[14px] font-medium">
        {t('subject')}
      </label>
      <input
        id="support-subject"
        required
        minLength={3}
        maxLength={150}
        className={field}
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
      />

      <label htmlFor="support-message" className="mt-3 block text-[14px] font-medium">
        {t('message')}
      </label>
      <textarea
        id="support-message"
        required
        minLength={10}
        maxLength={5000}
        rows={8}
        aria-describedby="support-message-hint"
        className={field}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <p id="support-message-hint" className="mt-1 text-[14px] text-[var(--fg-muted)]">
        {t('messageHint')}
      </p>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="min-h-11 rounded bg-[var(--brand)] px-4 text-[15px] font-medium text-[var(--brand-fg)] hover:bg-[var(--brand-hover)] disabled:opacity-60"
        >
          {pending ? t('sending') : t('send')}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-[15px] text-[var(--danger-fg)]">
          {error}
        </p>
      )}
      {sent && (
        <p role="status" className="mt-3 text-[15px] text-[var(--fg)]">
          {t('sent', { number: sent })}
        </p>
      )}
    </form>
  )
}
