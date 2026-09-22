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
  // /dev/null is readable, so this takes the restic path.
  writeFileSync(conf, 'RESTIC_REPOSITORY=sftp:nowhere:/repo\nRESTIC_PASSWORD_FILE=/dev/null\n')
  return spawnSync('bash', [script, maxHours], {
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GW_BACKUP_CONF: conf },
    encoding: 'utf8',
  })
}

/** A stand-in for ssh that reports what `stat -c %Y` would print, or nothing. */
function fakeSsh(dir, { hoursAgo, broken = false, empty = false }) {
  const bin = join(dir, 'bin')
  mkdirSync(bin, { recursive: true })
  const when = Math.floor((Date.now() - (hoursAgo ?? 0) * 3_600_000) / 1000)
  writeFileSync(
    join(bin, 'ssh'),
    ['#!/usr/bin/env bash', broken ? 'exit 255' : '', empty ? '' : `echo ${when}`].join('\n'),
    { mode: 0o755 },
  )
  return bin
}

/** Without a password file, and that is the case worth having. */
function runWatchOnly(dir, options, maxHours = '26') {
  const bin = fakeSsh(dir, options)
  const conf = join(dir, 'nas.conf')
  writeFileSync(conf, 'RESTIC_REPOSITORY=sftp:himalaya:/backups/repo\n')
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

  /**
   * The watcher that needs no secret.
   *
   * Asking restic means holding the repository password, and holding it on the
   * machine that watches the backups is the machine that must not be able to
   * read them. `snapshots/` carries one file per state, and how old the newest
   * one is answers "is anything still being backed up" completely.
   */
  describe('without the repository password', () => {
    it('reads the age from the repository directory instead', () => {
      const result = runWatchOnly(dir, { hoursAgo: 9 })
      expect(result.status).toBe(0)
      expect(result.stdout).toContain('In Ordnung')
    })

    it('fails when the newest state there is too old', () => {
      const result = runWatchOnly(dir, { hoursAgo: 40 })
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('Stunden alt')
    })

    it('fails when the host does not answer', () => {
      const result = runWatchOnly(dir, { broken: true })
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('antwortet nicht')
    })

    it('fails when the repository holds no state at all', () => {
      const result = runWatchOnly(dir, { empty: true })
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('kein einziger Stand')
    })

    it('refuses a repository it cannot look into without a password', () => {
      const bin = fakeSsh(dir, { hoursAgo: 1 })
      const conf = join(dir, 'nas.conf')
      writeFileSync(conf, 'RESTIC_REPOSITORY=s3:bucket/pfad\n')
      const result = spawnSync('bash', [script], {
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GW_BACKUP_CONF: conf },
        encoding: 'utf8',
      })
      expect(result.status).not.toBe(0)
      expect(result.stderr).toContain('sftp:')
    })
  })
})
