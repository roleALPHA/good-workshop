/** Who is making a request, resolved once at the edge and never re-derived. */
export type Actor = {
  tenantId: string
  /**
   * The tenant-scoped principal -- and `null` for a share-link guest, who is
   * not one.
   *
   * Nullable rather than filled with something member-shaped, because every
   * alternative lies somewhere: a share link's id in this field would reach
   * `app.member_id`, `updated_by` and `audit_event.actor_member_id` as a value
   * that is not a member, and minting a `member` row for a guest would require
   * an `identity` -- the global table this whole feature exists to stay out of.
   *
   * The cost is that the compiler now asks at every use site whether a guest
   * can get there. That is the point: `memberIdOf` below answers "no" for the
   * paths only a member reaches, and the agenda's attribution columns -- all
   * nullable, none carrying a foreign key to `member` -- answer "yes".
   */
  memberId: string | null
  tenantRole: 'member' | 'admin'
  /**
   * What the room is allowed to show for this actor. Server-established, so the
   * presence strip says who somebody is rather than who they claimed to be.
   */
  displayName?: string
  /** Present for MCP requests; intersected with the member's capabilities. */
  scopes?: string[]
  patId?: string
  source: 'web' | 'mcp' | 'api' | 'system' | 'guest'
  /**
   * The grant a share-link guest arrived with. Set in exactly one place --
   * `verifyGuestCookie` in src/server/auth/share-session.ts -- which re-reads
   * the link on every request, so revocation and a role change take effect now
   * rather than whenever a cookie happens to expire.
   *
   * `effectiveRole` may therefore trust this field. Nothing else may set it.
   */
  share?: { linkId: string; workshopId: string; role: 'editor' | 'viewer' }
}

export type TenantContext = Pick<Actor, 'tenantId' | 'memberId' | 'tenantRole'>

/**
 * The member id, for the paths only a member can reach.
 *
 * The library, folders, tokens, member administration and MCP are all
 * member-bound: a guest has no route to any of them, because a guest session
 * names one workshop and the guest area has no navigation out of it. Saying so
 * with this function rather than with `!` puts the claim where it can be read,
 * and turns a future mistake into a named error instead of `null` reaching a
 * query as a silent zero-row filter.
 */
export function memberIdOf(actor: Actor): string {
  if (!actor.memberId) {
    throw new Error(`member-only path reached by ${actor.source} actor without a member`)
  }
  return actor.memberId
}
