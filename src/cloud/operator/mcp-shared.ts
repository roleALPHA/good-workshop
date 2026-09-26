import { z } from 'zod'

/**
 * What both halves of the operator surface need.
 *
 * The console is split by subject -- the workspaces in ./mcp-tenant-tools.ts,
 * the Discover catalogue in ./mcp-catalog-tools.ts -- and both are mounted by
 * src/app/operator/api/mcp/route.cloud.ts.
 *
 * WHY THIS IS NOT AT /api/mcp, and cannot be: that endpoint runs in the public
 * web container as gw_app, and gw_app has EXECUTE on none of the app.op_*
 * functions. Postgres refuses before any code here would. The separation is the
 * strongest boundary in the system and these files live on the other side of it.
 *
 * WHY THIS IS ALLOWED AT ALL, given that docs/architecture.md says an MCP client
 * must never reach administration: that sentence is about a CUSTOMER'S token
 * reaching a workspace's members and access. This is a different subject (the
 * platform, not a workspace), a different endpoint, a different database role, a
 * different network and a different credential -- and it cannot read a single
 * workshop.
 */

export const Id = z.string().uuid()
export const Reason = z.string().trim().min(3).max(500)
export const Days = z.number().int().min(1).max(90)
