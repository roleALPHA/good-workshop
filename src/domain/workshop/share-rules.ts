import { DomainError } from '@/domain/errors'

/**
 * The rules a share link lives by, with no database in them.
 *
 * Separated from share-links.ts, which reads and writes rows, because these two
 * are guarded by different suites: the repository half needs a real Postgres for
 * RLS and its composite keys, while everything here is a pure answer to
 * "how long is this valid" and "is that an address" -- exactly the silent logic
 * the coverage thresholds exist to protect. A wrong answer from validUntil grants
 * or denies access to a stranger without failing anything.
 */

export type ShareRole = 'editor' | 'viewer'

export class ShareLinkError extends DomainError {}

/**
 * When a link stops working.
 *
 * Derived rather than stored, for the reason invariant 4 in schema.ts gives and
 * for a concrete one: workshops move. A date written into the row at invitation
 * time would lock a guest out of a workshop that was pushed by a week, and the
 * person who rescheduled it would have no reason to suspect the invitation.
 *
 * So the agenda itself is the deadline. Access ends at the start of the day
 * AFTER the last dated day, computed in UTC: for the European installations this
 * is built for that lands an hour or two into the following night, which errs
 * generously -- the failure mode to avoid is a link dying while the workshop is
 * still running.
 *
 * `null` when no day carries a date, which is a real state rather than an
 * oversight: a workshop that is not scheduled yet has no last day to end on, so
 * the only thing that ends such a link is a revocation.
 *
 * `explicit` is an override and wins outright when set. Not the earlier of the
 * two: an override that could only ever shorten would be unable to express "this
 * guest keeps access while we write up the results".
 */
export function validUntil(lastDayDate: string | null, explicit: Date | null = null): Date | null {
  if (explicit) return explicit
  if (!lastDayDate) return null

  const parsed = new Date(`${lastDayDate}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return new Date(parsed.getTime() + 86_400_000)
}

/** Whether a link has run out at `now`. */
export function isExpired(
  lastDayDate: string | null,
  explicit: Date | null,
  now: Date = new Date(),
): boolean {
  const until = validUntil(lastDayDate, explicit)
  return until !== null && now.getTime() >= until.getTime()
}

/**
 * The address, normalised the way the column stores it.
 *
 * `citext` already compares case-insensitively, so this is about the whitespace
 * a mail client adds when somebody copies an address out of it -- and about the
 * shape, checked with the same expression inviteMember uses so that the two
 * screens do not disagree about what an address is.
 */
export function normaliseEmail(raw: string): string {
  const email = raw.trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ShareLinkError('sharing.invalidEmail')
  }
  return email
}
