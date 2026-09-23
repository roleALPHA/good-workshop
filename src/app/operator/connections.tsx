'use client'

import { useTransition } from 'react'
import { disconnectClientAction } from './actions'

export type ConnectionRow = {
  clientId: string
  name: string
  scopes: string[]
  connected: string
  lastUsed: string
}

/**
 * The clients that can currently act as this operator.
 *
 * Deliberately not the token list next to it. An access token lasts an hour,
 * so one connected client writes twenty-four rows a day -- listing those would
 * bury the hand-issued credentials and turn the revoke list into a haystack at
 * exactly the moment somebody is hurrying through it.
 *
 * English and hardcoded, like the rest of the console.
 */
export function Connections({ connections }: { connections: ConnectionRow[] }) {
  const [pending, start] = useTransition()

  return (
    <section className="mt-10" aria-labelledby="connections">
      <h2 id="connections" className="text-[17px] font-medium">
        Connected clients
      </h2>
      <p className="mt-1 max-w-2xl text-[15px] text-[var(--fg-muted)]">
        Applications you have connected over OAuth. Disconnecting one revokes everything it holds,
        at once — it cannot quietly refresh itself afterwards.
      </p>

      {connections.length === 0 ? (
        <p className="mt-3 text-[15px] text-[var(--fg-muted)]">Nothing is connected.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {connections.map((connection) => (
            <li
              key={connection.clientId}
              className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-[var(--border)] p-3"
            >
              <div>
                <p className="text-[15px] font-medium">{connection.name}</p>
                <p className="mt-0.5 text-[14px] text-[var(--fg-muted)]">
                  {connection.scopes.join(', ')}
                </p>
                <p className="mt-0.5 text-[13px] text-[var(--fg-subtle)]">
                  Connected {connection.connected} · last used {connection.lastUsed}
                </p>
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await disconnectClientAction({ clientId: connection.clientId })
                  })
                }
                className="min-h-11 rounded border border-[var(--border-strong)] px-3 text-[15px] hover:bg-[var(--surface-raised)] disabled:opacity-60"
              >
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
