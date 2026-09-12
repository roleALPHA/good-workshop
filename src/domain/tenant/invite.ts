/**
 * Whether the admin who sent an invitation gets to see the link.
 *
 * The rule the invite action already described in prose, minus the corner it
 * missed: the link goes back to the admin ONLY when it did not reach the
 * recipient, because an install with no relay would otherwise have an
 * invitation screen that does nothing.
 *
 * What was missing is that a link is issued even when the address already
 * belongs to an ACTIVE member -- and an active member's magic link is not an
 * invitation, it is that person's login. A tenant admin already reads every
 * workshop in the tenant, so what this buys an attacker is not data: it is
 * acting as somebody else, under their name, in audit entries and in the
 * presence strip. That is precisely what the audit trail exists to rule out.
 *
 * A named function rather than a conditional at the call site, because the
 * interesting part is the combination, and a combination deserves a table.
 */
export function inviteDisclosure(outcome: { alreadyMember: boolean; mailed: boolean }): boolean {
  if (outcome.alreadyMember) return false
  return !outcome.mailed
}
