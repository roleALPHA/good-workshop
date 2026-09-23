import { tokenEndpoint } from '@/server/oauth/endpoints'
import { openTenantStore } from '@/server/oauth/tenant-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** The two grants and their checks live in src/server/oauth/endpoints.ts. */
export const POST = tokenEndpoint(openTenantStore)
