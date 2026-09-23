import { revocationEndpoint } from '@/server/oauth/endpoints'
import { openTenantStore } from '@/server/oauth/tenant-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** RFC 7009, always 200. See src/server/oauth/endpoints.ts. */
export const POST = revocationEndpoint(openTenantStore)
