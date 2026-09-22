// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'

const script = join(dirname(fileURLToPath(import.meta.url)), 'backup-freshness.sh')

/**
 * Whether anything is still being backed up at all.
 *
 * The backup run says so loudly when the offsite step fails. A timer that has
 * stopped firing says nothing, and a host that is down says less than that —
 * which is why this check belongs on a different machine, and why it has to
 * fail rather than shrug when the answer is "no idea".
 */

/** A stand-in for restic that reports a snapshot of a given age, or nothing. */
function fakeRestic(dir, { hoursAgo, broken = false, empty = false }) {
  const bin = join(dir, 'bin')
  mkdirSync(bin, { recursive: true })
  const when = new Date(Date.now() - (hoursAgo ?? 0) * 3_600_000).toISOString()
  writeFileSync(
    join(bin, 'restic'),
    [
      '#!/usr/bin/env bash',
      broken ? 'exit 1' : '',
      empty ? "echo '[]'" : `echo '[{"time":"${when}"}]'`,
    ].join('\n'),
    { mode: 0o755 },
  )
  return bin
}

function run(dir, options, maxHours = '26') {
  const bin = fakeRestic(dir, options)
  const conf = join(dir, 'nas.conf')
  writeFileSync(conf, 'RESTIC_REPOSITORY=sftp:nowhere:/repo\nRESTIC_PASSWORD_FILE=/dev/null\n')
  return spawnSync('bash', [script, maxHours], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GW_BACKUP_CONF: conf },
    encoding: 'utf8',
  })
}

describe('scripts/backup-freshness.sh', () => {
  let dir

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gw-freshness-'))
  })

  it('is content with last night’s backup', () => {
    const result = run(dir, { hoursAgo: 9 })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('In Ordnung')
  })

  it('fails when the newest state is older than the window', () => {
    const result = run(dir, { hoursAgo: 50 })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Stunden alt')
  })

  /** Silence is the failure mode this exists for: not answering is not "fine". */
  it('fails when the repository does not answer', () => {
    const result = run(dir, { broken: true })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('antwortet nicht')
  })

  it('fails when the repository has never been written to', () => {
    const result = run(dir, { empty: true })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('kein Stand')
  })

  it('fails when it cannot even find its configuration', () => {
    const bin = fakeRestic(dir, { hoursAgo: 1 })
    const result = spawnSync('bash', [script], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        GW_BACKUP_CONF: join(dir, 'gibtsnicht.conf'),
      },
      encoding: 'utf8',
    })
    expect(result.status).not.toBe(0)
  })
})
