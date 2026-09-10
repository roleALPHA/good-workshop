/** Who is making a request, resolved once at the edge and never re-derived. */
export type Actor = {
  tenantId: string
  memberId: string
  tenantRole: 'member' | 'admin'
  /** Present for MCP requests; intersected with the member's capabilities. */
  scopes?: string[]
  patId?: string
  source: 'web' | 'mcp' | 'api' | 'system'
}

export type TenantContext = Pick<Actor, 'tenantId' | 'memberId' | 'tenantRole'>
