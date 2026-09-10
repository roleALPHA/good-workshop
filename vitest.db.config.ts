import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Database tests, separate from the unit suite because they need a real
 * Postgres with the migrations applied. They are their own CI job for the same
 * reason -- and because a failure here means the tenant boundary is broken,
 * which deserves to be its own red light rather than one line among hundreds.
 */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/server/**/*.db.test.ts'],
    // One connection pool, one migration state: parallel files would fight.
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://gw_app@127.0.0.1:5433/goodworkshop',
      OPS_DATABASE_URL:
        process.env.OPS_DATABASE_URL ?? 'postgres://gw_ops@127.0.0.1:5433/goodworkshop',
    },
  },
})
