import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * The cloud edition against a real database with the cloud migrations applied.
 *
 * A database of its own, not the one vitest.db.config.ts uses: the cloud
 * allows one membership per person, and the community suite deliberately puts
 * one person into two tenants. CI gives this suite its own Postgres; locally,
 * point the URLs at a second database (docs/testing-conventions.md).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@gw/edition': fileURLToPath(new URL('./src/server/edition/cloud.ts', import.meta.url)),
      '@gw/home': fileURLToPath(new URL('./src/cloud/site/home.tsx', import.meta.url)),
      // The empty catalogue. A test that wants designs mocks this module;
      // the private implementation is not in this repository at all.
      '@gw/catalog': fileURLToPath(new URL('./src/cloud/catalog/unavailable.ts', import.meta.url)),
      '@gw/billing-adapters': fileURLToPath(
        new URL('./src/cloud/billing/adapters/unavailable.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.cloud.db.test.ts'],
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgres://gw_app@127.0.0.1:5433/goodworkshop_cloud',
      OPS_DATABASE_URL:
        process.env.OPS_DATABASE_URL ?? 'postgres://gw_ops@127.0.0.1:5433/goodworkshop_cloud',
    },
  },
})
