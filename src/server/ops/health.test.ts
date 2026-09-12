import { describe, expect, it } from 'vitest'
import { migrationState, publicReport } from './health'

/**
 * The one comparison a deploy depends on.
 *
 * Getting "behind" wrong means a container serving pages against a schema it
 * does not understand; getting "ahead" wrong means every rolling deploy takes
 * the installation down on its way through. Both are worth a table.
 */
describe('migrationState', () => {
  it('is healthy when the database matches the image', () => {
    expect(migrationState(['0000_init', '0001_collab'], 2)).toEqual({
      name: 'migrations',
      ok: true,
      detail: undefined,
    })
  })

  it('fails when the database is behind, and names what is missing', () => {
    const state = migrationState(['0000_init', '0001_collab', '0002_tags'], 1)
    expect(state.ok).toBe(false)
    expect(state.detail).toContain('0001_collab')
    expect(state.detail).toContain('0002_tags')
  })

  it('tolerates a database that is ahead, and says so', () => {
    // The normal state during a rolling deploy: the migration runs first and
    // the old containers keep serving until they are replaced.
    const state = migrationState(['0000_init'], 2)
    expect(state.ok).toBe(true)
    expect(state.detail).toMatch(/voraus/)
  })

  it('fails a fresh database that has had nothing applied', () => {
    expect(migrationState(['0000_init'], 0).ok).toBe(false)
  })

  it('is healthy when there is nothing to apply', () => {
    expect(migrationState([], 0).ok).toBe(true)
  })
})

/**
 * What the endpoint is allowed to say to a stranger.
 *
 * /api/health sits behind Caddy's catch-all, so it answers the open internet.
 * Today it returns the exact commit it is running, the names of migrations it
 * is missing, and -- when the database is unreachable -- whatever the Postgres
 * driver put in the message: internal hostnames, ports, role names.
 *
 * None of that is needed to answer the only question a health check is asked,
 * which is whether this container can serve. The detail still has to exist for
 * the operator; it just must not be the default answer to an anonymous GET.
 */
describe('publicReport', () => {
  const checks = [
    { name: 'database', ok: false, detail: 'connect ECONNREFUSED 172.18.0.2:5432' },
    { name: 'migrations', ok: false, detail: '3/7 angewendet. Fehlt: 0003_x, 0004_y' },
  ]

  it('reports the status without explaining the internals', () => {
    const report = publicReport(checks, 'v1.4.0-a1b2c3d')
    expect(JSON.stringify(report)).not.toMatch(/172\.18\.0\.2|5432|0003_x|a1b2c3d/)
  })

  it('still says which check failed', () => {
    // Redaction must not turn the endpoint into a coin flip: an operator
    // reading a 503 needs to know it was the database, not the migrations.
    const report = publicReport(checks, 'v1.4.0-a1b2c3d')
    expect(report.checks).toEqual([
      { name: 'database', ok: false },
      { name: 'migrations', ok: false },
    ])
    expect(report.status).toBe('unhealthy')
  })

  it('keeps the detail for whoever is entitled to it', () => {
    const report = publicReport(checks, 'v1.4.0-a1b2c3d', { detailed: true })
    expect(report.checks[0]).toMatchObject({ detail: expect.stringContaining('ECONNREFUSED') })
    expect(report.version).toBe('v1.4.0-a1b2c3d')
  })
})
