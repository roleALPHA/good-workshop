import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

/**
 * MODULE-PRIVATE. Do not import this file.
 *
 * An ESLint rule blocks importing it outside src/server/db, and that rule is
 * not a style preference: every query has to run inside a transaction that has
 * set app.tenant_id, or RLS has nothing to enforce against. `withTenant` in
 * index.ts is the only sanctioned way in.
 *
 * The pool is created LAZILY, on first query. Creating it at module scope makes
 * `next build` fail while collecting page data -- a build must not need a
 * database -- and it makes a container refuse to start when Postgres is not up
 * yet, rather than waiting and retrying like it should.
 */

declare global {
  var __gwPool: pg.Pool | undefined
  var __gwDb: ReturnType<typeof drizzle<typeof schema>> | undefined
}

function getPool(): pg.Pool {
  if (globalThis.__gwPool) return globalThis.__gwPool

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. It is only needed at runtime -- if you are seeing this during a build, something imported the database at module scope.',
    )
  }

  const pool = new pg.Pool({
    connectionString,
    max: Number(process.env.GW_DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })

  // Memoised on globalThis: Next.js hot reload otherwise leaks a pool per edit
  // until the server runs out of connections.
  globalThis.__gwPool = pool
  return pool
}

export function getDb() {
  globalThis.__gwDb ??= drizzle(getPool(), { schema })
  return globalThis.__gwDb
}

export type Database = ReturnType<typeof getDb>
