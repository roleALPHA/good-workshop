import { describe, expect, it } from 'vitest'
import { migrationState } from './health'

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
