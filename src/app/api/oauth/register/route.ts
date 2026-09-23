import { registrationEndpoint } from '@/server/oauth/endpoints'
import { openTenantStore } from '@/server/oauth/tenant-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * RFC 7591 Dynamic Client Registration, for the customers' server.
 *
 * The rules, the rate limit and the reason registration is open at all are in
 * src/server/oauth/endpoints.ts, shared with the operator console's server at
 * /operator/api/oauth/register. This file supplies only the store.
 */
export const POST = registrationEndpoint(openTenantStore)
