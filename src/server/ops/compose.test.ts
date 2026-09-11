import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'

/**
 * The deployment descriptor, asserted like code -- because it is code.
 *
 * Everything the application does to keep the tenant boundary intact happens
 * inside Postgres: FORCE ROW LEVEL SECURITY, an unprivileged NOINHERIT runtime
 * role, an explicit revoke on the identity tables, one narrow SECURITY DEFINER
 * function. All of it rests on the assumption that the web container connects
 * as `gw_app` and cannot connect as anything else. That assumption lives in
 * this file, and nothing tested it.
 */

const root = join(import.meta.dirname, '../../..')

// `merge: true` is load-bearing, not a style choice. The environment blocks in
// this file inherit through a YAML anchor (`<<: *db-socket`); without merge
// resolution the parser reports a literal '<<' key and every assertion below
// passes while inspecting nothing. A test that cannot see the anchor cannot see
// the finding.
const compose = parse(readFileSync(join(root, 'compose.yaml'), 'utf8'), { merge: true }) as {
  services: Record<string, { image?: string; environment?: Record<string, string> }>
}

const envOf = (service: string) => compose.services[service]?.environment ?? {}

describe('compose.yaml', () => {
  it('does not hand the web container a superuser connection', () => {
    // The YAML anchor gives every service that uses it all three DSNs. The web
    // container is long-lived, runs application code, and is the one container
    // an attacker reaches first -- so the superuser string sits ready in
    // process.env for anything that gets that far.
    expect(Object.keys(envOf('app'))).not.toContain('ADMIN_DATABASE_URL')
  })

  it('does not hand the web container the migration connection either', () => {
    // gw_owner owns the schema, so it is not subject to its own policies.
    // Only the `migrate` service needs it.
    expect(Object.keys(envOf('app'))).not.toContain('MIGRATION_DATABASE_URL')
  })

  it('still gives the migration service what it needs', () => {
    // Guarding against the lazy fix: removing the anchor everywhere would make
    // the assertions above pass and the stack fail to start.
    expect(Object.keys(envOf('migrate'))).toEqual(
      expect.arrayContaining(['MIGRATION_DATABASE_URL', 'ADMIN_DATABASE_URL']),
    )
  })

  it('gives the proxy the hostname its configuration asks for', () => {
    // The Caddyfile opens with `{$GW_HOSTNAME} {`. That is Caddy's own env
    // substitution inside the mounted file, not Compose interpolation -- and
    // Compose does not pass .env into containers by itself. Without this the
    // site block has no address, so the recommended HTTPS path does not come
    // up at all, and the operator's next move is to serve plain HTTP.
    expect(Object.keys(envOf('caddy'))).toContain('GW_HOSTNAME')
  })

  it('does not make the dangerous mail transport the default', () => {
    // `console` writes complete magic links to stdout. Fine as a deliberate
    // choice for an install without a relay; not fine as what you get by
    // saying nothing. Note the contrast with GW_APP_URL right above it, which
    // is correctly declared mandatory with `:?`.
    expect(envOf('app').GW_MAIL_TRANSPORT ?? '').not.toMatch(/:-console/)
  })

  it('pins the application image instead of tracking a moving tag', () => {
    // Every GitHub Action in this repo is pinned to a full-length SHA. The
    // image the operator actually runs defaults to `latest`.
    expect(compose.services.app?.image ?? '').not.toMatch(/:-latest/)
  })
})

describe('Dockerfile', () => {
  it('pins the base image by digest', () => {
    const dockerfile = readFileSync(join(root, 'Dockerfile'), 'utf8')
    const baseArg = dockerfile.match(/ARG NODE_VERSION=(.+)/)?.[1] ?? ''
    expect(baseArg).toMatch(/@sha256:[0-9a-f]{64}/)
  })
})
