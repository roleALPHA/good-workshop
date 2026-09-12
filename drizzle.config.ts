import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  },
  // Roles are created by scripts/db-bootstrap.mjs, which runs as a superuser.
  // Drizzle must not try to manage or drop them.
  entities: {
    roles: { provider: '', exclude: ['gw_owner', 'gw_app', 'gw_auth', 'gw_ops'] },
  },
  verbose: true,
  strict: true,
})
