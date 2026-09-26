import { isLocale, type Locale } from '@/i18n/config'
import type { PlanKey } from './plans'

/**
 * What every step of the billing run is handed.
 *
 * The types live apart from the steps because all of them take the same three
 * things -- a connection, the options and the moment -- and a step that invented
 * its own shape of any of them would be a step the run cannot call.
 *
 * `now` is INJECTED, never read from the clock inside a step. The whole run is
 * computed against one instant, so a month boundary cannot fall in the middle of
 * it, and a test can put the run on any day without touching time itself:
 * `vi.useFakeTimers()` appears nowhere in this repository, and that is a
 * decision rather than a gap.
 */

export type Db = {
  query: (text: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }> // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * What the billing run tells a customer -- in the language they registered in,
 * which the billing account remembers.
 */
export type Notice = { to: string; locale: Locale } & (
  | { kind: 'trial_ending'; daysLeft: number }
  | { kind: 'read_only'; reason: 'trial_ended' | 'payment_failed' }
  | { kind: 'payment_failed'; retryAt: Date | null }
  | { kind: 'contract_ended'; exportUntil: Date }
  | { kind: 'dunning'; blockOn: Date }
  | { kind: 'payment_blocked' }
  | { kind: 'unblocked' }
  | { kind: 'price_change'; plan: PlanKey; netCents: number; from: string }
  | { kind: 'terms_change'; document: string; version: string; from: string }
)

export type RunOptions = {
  now: Date
  /** dry_run computes and records periods but never calls accounting or payments. */
  mode: 'dry_run' | 'live'
  /** A computed invoice above this net amount is held for an operator. */
  maxInvoiceCents: number
  /** Days between an invoice going out and the amount being collected. */
  collectAfterDays: number
  notify: (notice: Notice) => Promise<void>
  log: (message: string, data?: Record<string, unknown>) => void
}

export const DAY = 86_400_000

/** What the account remembers, or German when it remembers nothing usable. */
export function localeOf(value: string | null | undefined): Locale {
  return isLocale(value) ? value : 'de'
}

/**
 * Tells the customer, and never lets that get in the way of the books.
 *
 * A notice is a side effect; what has just been written is the truth. When the
 * mail fails -- a provider outage, a configuration the worker cannot reach --
 * the run has to carry on, or a tenant that should be locked stays open and a
 * failed charge looks like an invoice nobody ever tried to collect. Which is
 * exactly what happened: the worker could not send at all, the exception
 * unwound the handling around it, and the failure became invisible.
 */
export async function announce(options: RunOptions, notice: Notice): Promise<void> {
  try {
    await options.notify(notice)
  } catch (error) {
    options.log('billing: notice could not be sent', {
      kind: notice.kind,
      to: notice.to,
      error: String(error instanceof Error ? error.message : error),
    })
  }
}
