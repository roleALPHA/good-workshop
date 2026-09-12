/** Who is making a request, resolved once at the edge and never re-derived. */
export type Actor = {
  tenantId: string
  memberId: string
  tenantRole: 'member' | 'admin'
  /**
   * What the room is allowed to show for this actor. Server-established, so the
   * presence strip says who somebody is rather than who they claimed to be.
   */
  displayName?: string
  /** Present for MCP requests; intersected with the member's capabilities. */
  scopes?: string[]
  patId?: string
  source: 'web' | 'mcp' | 'api' | 'system'
}

export type TenantContext = Pick<Actor, 'tenantId' | 'memberId' | 'tenantRole'>
