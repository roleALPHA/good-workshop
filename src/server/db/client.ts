import { drizzle } from 'drizzle-orm/node-postgres'
import pg from 'pg'
import * as schema from './schema'

/**
 * MODULE-PRIVATE. Do not import this file.
 *
 * An ESLint rule blocks importing it from anywhere outside src/server/db, and
 * that rule is not a style preference: every query has to run inside a
 * transaction that has set app.tenant_id, or RLS has nothing to enforce
 * against. `withTenant` in index.ts is the only sanctioned way in.
 */

declare global {
  var __gwPool: pg.Pool | undefined
}

function createPool(): pg.Pool {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is not set.')

  return new pg.Pool({
    connectionString,
    max: Number(process.env.GW_DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })
}

// Memoised on globalThis: Next.js hot reload otherwise leaks a pool per edit
// until the server runs out of connections.
export const pool: pg.Pool = globalThis.__gwPool ?? createPool()
if (process.env.NODE_ENV !== 'production') globalThis.__gwPool = pool

export const db = drizzle(pool, { schema })
export type Database = typeof db
