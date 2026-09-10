import { startCollabServer } from './ws'

/**
 * Entry point for the collaboration process.
 *
 * Bundled separately (see `pnpm build:collab`) because it needs the TypeScript
 * domain code but is not part of Next's traced output -- no route imports it,
 * so tracing would leave it out of the image entirely.
 */
const port = Number(process.env.GW_COLLAB_PORT ?? 3001)
const server = startCollabServer({ port, path: process.env.GW_COLLAB_PATH ?? '/collab' })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // Flushes every open room before exiting: a container stop must not drop
    // edits that are still only in memory.
    void server.close().finally(() => process.exit(0))
  })
}
