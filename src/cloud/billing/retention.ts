import { DAY, type Db, type RunOptions } from './context'

/**
 * How long rows that have stopped being useful are kept.
 *
 * Storage limitation (Art. 5(1)(e) GDPR) is an obligation, not a tidiness
 * preference, and every one of these carries something about a person: an
 * address and an IP on a sign-in link, an IP and a user agent on a session, a
 * trail of who did what. The numbers are here rather than in the SQL so that
 * the privacy policy and the code can be checked against each other -- and a
 * test does exactly that.
 */
export const RETENTION_DAYS = {
  /** Sign-in links and invitations, useless the moment they expire. */
  emailToken: 30,
  /** Sessions that can no longer be used, ours and a guest's. */
  session: 30,
  /** The audit trail: long enough to answer "who did that", not longer. */
  auditEvent: 365,
} as const

/**
 * Deletes what has stopped being useful.
 *
 * `docs/data-protection.md` used to say, first and in bold, that GoodWorkshop
 * has no retention job and that an operator therefore has to schedule one. That
 * is a fair answer for a self-hosted installation, where the operator is the
 * controller. In the cloud WE are the processor and the sentence was simply a
 * gap: expired rows were treated as invalid when read and kept for ever.
 *
 * Runs as the operations role, which is not scoped to a tenant -- these sweep
 * all of them, which is the point.
 */
export async function sweepExpired(db: Db, options: RunOptions) {
  if (options.mode === 'dry_run') {
    options.log('billing: dry run, nothing swept')
    return
  }

  const swept: Record<string, number> = {}
  const statements: [string, string, number][] = [
    ['email_token', `delete from email_token where expires_at < $1`, RETENTION_DAYS.emailToken],
    [
      'auth_session',
      `delete from auth_session where expires_at < $1 or revoked_at < $1`,
      RETENTION_DAYS.session,
    ],
    [
      'share_session',
      `delete from share_session where expires_at < $1 or revoked_at < $1`,
      RETENTION_DAYS.session,
    ],
    ['audit_event', `delete from audit_event where created_at < $1`, RETENTION_DAYS.auditEvent],
  ]

  for (const [table, statement, days] of statements) {
    const before = new Date(options.now.getTime() - days * DAY)
    const { rowCount } = await db.query(statement, [before])
    if (rowCount) swept[table] = rowCount
  }

  if (Object.keys(swept).length > 0) options.log('billing: swept expired rows', swept)
}
