import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import pkg from '../package.json'
import server from '../server.json'

/**
 * What the MCP registry is told about this server (registry.modelcontextprotocol.io).
 *
 * A file in a directory somewhere else is exactly the kind of copy that goes
 * stale without anybody noticing: nothing here imports it, nothing renders it,
 * and being wrong costs a model a failed connection rather than a red build.
 * So the facts it repeats are checked against the ones they were copied from.
 */
describe('server.json', () => {
  it('names the version this repository is at', () => {
    // A sixth place the release has to touch, and the reason it is safe to have
    // one: this fails instead of the registry quietly advertising 0.8.9.
    expect(server.version).toBe(pkg.version)
  })

  it('points at the endpoint that actually exists', () => {
    const remote = server.remotes[0]!
    expect(remote.url).toBe('https://goodworkshop.org/api/mcp')
    // The route behind it. Renaming the folder without renaming this is the
    // failure mode worth a test.
    const route = join(__dirname, 'app', 'api', 'mcp', 'route.ts')
    expect(() => readFileSync(route)).not.toThrow()
  })

  it('keeps the description inside the limit the registry sets', () => {
    // server.schema.json: maxLength 100.
    expect(server.description.length).toBeLessThanOrEqual(100)
  })

  it('never calls the product open source', () => {
    // Apache 2.0 with the Commons Clause is source-available. The same rule the
    // rest of the public copy follows.
    expect(JSON.stringify(server).toLowerCase()).not.toContain('open source')
  })
})
