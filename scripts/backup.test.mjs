// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'

const script = join(dirname(fileURLToPath(import.meta.url)), 'backup.sh')

/**
 * A stand-in for `docker` that plays one of three ways a dump ends.
 *
 * `fail` is the one that started this: the container refuses the connection,
 * pg_dump says so on stderr and writes NOTHING to stdout. The shell has already
 * created the redirect target by then, and gzip is perfectly happy to compress
 * an empty stream -- so a 20-byte archive lands where a backup should be.
 */
function fakeDocker(dir, mode) {
  const bin = join(dir, 'bin')
  mkdirSync(bin, { recursive: true })
  const argv = join(dir, 'argv')
  writeFileSync(
    join(bin, 'docker'),
    [
      '#!/usr/bin/env bash',
      `printf '%s\\n' "$*" >> ${JSON.stringify(argv)}`,
      `case ${JSON.stringify(mode)} in`,
      '  fail)',
      "    echo 'pg_dump: error: connection to server failed: FATAL: Peer authentication failed' >&2",
      '    exit 1;;',
      '  truncated)',
      "    printf -- '-- PostgreSQL database dump\\nCREATE TABLE workshop ();\\n';;",
      '  *)',
      "    printf -- '-- PostgreSQL database dump\\nCREATE TABLE workshop ();\\n-- PostgreSQL database dump complete\\n';;",
      'esac',
    ].join('\n'),
    { mode: 0o755 },
  )
  chmodSync(join(bin, 'docker'), 0o755)
  return { bin, argv }
}

function run(dir, mode, dest) {
  const { bin, argv } = fakeDocker(dir, mode)
  const result = spawnSync('bash', [script, dest], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
    encoding: 'utf8',
  })
  return { ...result, argv: existsSync(argv) ? readFileSync(argv, 'utf8') : '' }
}

describe('scripts/backup.sh', () => {
  let dir
  let dest

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gw-backup-'))
    dest = join(dir, 'goodworkshop.sql.gz')
  })

  it('leaves no file behind when pg_dump fails', () => {
    const result = run(dir, 'fail', dest)

    expect(result.argv, 'pg_dump wurde nie aufgerufen').toContain('pg_dump')
    expect(result.status).not.toBe(0)
    expect(existsSync(dest)).toBe(false)
  })

  it('keeps the previous backup when the new dump fails', () => {
    writeFileSync(dest, 'die Sicherung von gestern')

    const result = run(dir, 'fail', dest)

    expect(result.argv, 'pg_dump wurde nie aufgerufen').toContain('pg_dump')
    expect(result.status).not.toBe(0)
    expect(readFileSync(dest, 'utf8')).toBe('die Sicherung von gestern')
  })

  it('refuses a dump that breaks off mid-stream', () => {
    const result = run(dir, 'truncated', dest)

    expect(result.argv, 'pg_dump wurde nie aufgerufen').toContain('pg_dump')
    expect(result.status).not.toBe(0)
    expect(existsSync(dest)).toBe(false)
  })

  it('writes a complete dump', () => {
    const result = run(dir, 'ok', dest)

    expect(result.status, result.stderr).toBe(0)
    expect(gunzipSync(readFileSync(dest)).toString()).toContain(
      '-- PostgreSQL database dump complete',
    )
  })

  it('authenticates as postgres inside the container', () => {
    // Peer authentication over the container's local socket goes by user name.
    // Without -u postgres the dump fails -- the failure this script exists for.
    const result = run(dir, 'ok', dest)

    expect(result.argv).toContain('-u postgres')
  })
})
