import { startCollabServer } from './ws'

/**
 * Entry point for the collaboration process.
 *
 * Bundled separately (see `pnpm build:collab`) because it needs the TypeScript
 * domain code but is not part of Next's traced output -- no route imports it,
 * so tracing would leave it out of the image entirely.
 */
const port = Number(process.env.GW_COLLAB_PORT ?? 3001)

/**
 * Timings can be shortened from the environment.
 *
 * Not a convenience: with the production defaults a test would wait three
 * seconds for every write and thirty for a teardown, which in practice means
 * those paths would go untested.
 */
const timings = {
  persistDebounceMs: Number(process.env.GW_COLLAB_PERSIST_MS ?? 400),
  materializeDebounceMs: Number(process.env.GW_COLLAB_MATERIALIZE_MS ?? 3_000),
  emptyGraceMs: Number(process.env.GW_COLLAB_GRACE_MS ?? 30_000),
}

const server = startCollabServer({
  port,
  path: process.env.GW_COLLAB_PATH ?? '/collab',
  timings,
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    // Flushes every open room before exiting: a container stop must not drop
    // edits that are still only in memory.
    void server.close().finally(() => process.exit(0))
  })
}
