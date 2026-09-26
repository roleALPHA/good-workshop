import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RETENTION_DAYS } from './retention'

/**
 * The periods the privacy policy names, and the ones the sweep actually uses.
 *
 * A retention period is a promise to a data subject, and the two copies of it
 * -- the sentence they read and the `delete` that runs -- have no reason to
 * stay in step unless something checks. This is that something: change the
 * constant and the document fails until it says the same thing.
 */
const policy = readFileSync(join(process.cwd(), 'src', 'cloud', 'legal', 'datenschutz.md'), 'utf8')

describe('the retention periods', () => {
  it.each([
    [
      'sign-in links and invitations',
      RETENTION_DAYS.emailToken,
      `${RETENTION_DAYS.emailToken} Tagen`,
    ],
    ['sessions', RETENTION_DAYS.session, `${RETENTION_DAYS.session} Tagen`],
    ['the audit trail', RETENTION_DAYS.auditEvent, 'einem Jahr'],
  ])('for %s are in the privacy policy as well', (_what, days, phrase) => {
    expect(days).toBeGreaterThan(0)
    expect(
      policy,
      `datenschutz.md has to name this period ("${phrase}") -- it is what a customer reads.`,
    ).toContain(phrase)
  })

  it('names a year as 365 days, which is what the sweep deletes by', () => {
    expect(RETENTION_DAYS.auditEvent).toBe(365)
  })
})
