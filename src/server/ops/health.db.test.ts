import { describe, expect, it } from 'vitest'
import { runChecks } from './health'

/**
 * The checks against a real database.
 *
 * The interesting one is the migration ledger: it is owned by the migration
 * role, and the application role can only read it because a grant says so.
 * That grant is applied by the migration script on every run, and if it ever
 * stops being applied every container in the fleet reports itself unhealthy --
 * which is exactly the kind of thing to find here rather than during a deploy.
 */
describe('runChecks', () => {
  it('reports a reachable database and an applied schema', async () => {
    const checks = await runChecks()

    expect(checks.map((check) => check.name)).toEqual(['database', 'migrations'])
    expect(
      checks.every((check) => check.ok),
      JSON.stringify(checks),
    ).toBe(true)
  })
})
