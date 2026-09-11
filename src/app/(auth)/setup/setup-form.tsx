'use client'

import { useState } from 'react'
import { claim, type SetupResult } from './actions'

const field =
  'mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[15px]'

export function SetupForm() {
  const [result, setResult] = useState<SetupResult | null>(null)
  const [pending, setPending] = useState(false)

  async function submit(formData: FormData) {
    setPending(true)
    try {
      setResult(await claim(formData))
    } finally {
      setPending(false)
    }
  }

  if (result?.ok) {
    return (
      <div className="mt-6 rounded border border-[var(--border)] bg-[var(--surface)] p-4">
        <p className="font-medium">Die Installation gehört jetzt {result.email}.</p>
        {result.link ? (
          <>
            <p className="mt-2 text-[15px] text-[var(--fg-muted)]">
              Es ist noch kein Mailversand eingerichtet, deshalb steht der Anmeldelink hier. Er gilt
              einmal und läuft ab.
            </p>
            <p className="mt-3 rounded bg-[var(--bg)] p-3 font-mono text-[13px] break-all">
              <a href={result.link}>{result.link}</a>
            </p>
          </>
        ) : (
          <p className="mt-2 text-[15px] text-[var(--fg-muted)]">
            Der Anmeldelink ist unterwegs. Schau in dein Postfach.
          </p>
        )}
      </div>
    )
  }

  return (
    <form action={submit} className="mt-6 space-y-4">
      {result && !result.ok && (
        <p
          role="alert"
          className="rounded border border-[var(--border)] bg-[var(--warn-bg)] px-3 py-2 text-[14px] text-[var(--warn-fg)]"
        >
          {result.error}
        </p>
      )}

      <div>
        <label htmlFor="setup-email" className="text-[14px] font-medium">
          Deine E-Mail-Adresse
        </label>
        <input
          id="setup-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={field}
          placeholder="du@example.com"
        />
        <p className="mt-1 text-[13px] text-[var(--fg-subtle)]">
          Damit meldest du dich künftig an. Weitere Personen lädst du danach in der Oberfläche ein.
        </p>
      </div>

      <div>
        <label htmlFor="setup-token" className="text-[14px] font-medium">
          Einrichtungsschlüssel
        </label>
        <input
          id="setup-token"
          name="token"
          required
          autoComplete="off"
          spellCheck={false}
          className={`${field} font-mono`}
        />
        <p className="mt-1 text-[13px] text-[var(--fg-subtle)]">
          Steht im Log des Servers: <code>docker compose logs app</code>
        </p>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded bg-[var(--brand-600)] px-4 py-2 text-[15px] font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Einen Moment …' : 'Installation einrichten'}
      </button>
    </form>
  )
}
