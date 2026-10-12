/**
 * Field locks: who is typing where, and who therefore may not.
 *
 * A lock is a claim in the room's presence, not a row anywhere. That is the
 * point of it: presence is tied to the connection, so a lock goes when its
 * holder goes -- a field left, a tab closed, a socket the server's heartbeat
 * ends. A lock in a table would need somebody to remove it, and the case that
 * matters is the one where nobody is left to.
 *
 * Advisory, and deliberately so. Every browser holds back from a field another
 * one holds; the server does not check updates against claims. The harm this
 * prevents is the accidental overwrite, which advisory locks prevent fully.
 * A writer over MCP does not take part.
 */

export type FieldClaim = {
  clientId: number
  blockId: string
  /** `title`, `durationMinutes`, `responsible`, or `desc.<field>` for the type's own fields. */
  field: string
  /** The claimant's clock when it entered the field. Only ever compared in a race. */
  since: number
}

export const lockKey = (blockId: string, field: string) => `${blockId}\u0000${field}`

/**
 * The holder of every claimed field.
 *
 * Earliest claim first, then the lower client id. Clocks differ between
 * machines, which matters less than it seems: a field somebody already holds
 * is shown locked and cannot be entered, so two claims on one field only exist
 * when two people clicked within the same moment -- and for that, any rule
 * every screen agrees on is right.
 */
export function fieldHolders(claims: readonly FieldClaim[]): Map<string, FieldClaim> {
  const out = new Map<string, FieldClaim>()
  for (const claim of claims) {
    const key = lockKey(claim.blockId, claim.field)
    const current = out.get(key)
    if (
      !current ||
      claim.since < current.since ||
      (claim.since === current.since && claim.clientId < current.clientId)
    ) {
      out.set(key, claim)
    }
  }
  return out
}
