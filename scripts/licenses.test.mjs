// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  canonicalName,
  flatten,
  renderIndex,
  renderNotices,
  renderSbom,
  violations,
} from './licenses.mjs'

const script = join(dirname(fileURLToPath(import.meta.url)), 'licenses.mjs')

/** The shape `pnpm licenses list --json` produces, trimmed to what we read. */
const sample = {
  MIT: [
    { name: 'clsx', versions: ['2.1.1'], paths: [], license: 'MIT', homepage: 'https://clsx.dev' },
    { name: '@next/env', versions: ['16.3.5'], paths: [], license: 'MIT', homepage: '' },
  ],
  'Apache-2.0 AND MIT': [{ name: 'dual', versions: ['1.0.0'], paths: [], license: '' }],
}

function run(input, ...args) {
  const dir = mkdtempSync(join(tmpdir(), 'licences-'))
  const file = join(dir, 'input.json')
  writeFileSync(file, JSON.stringify(input))
  return {
    dir,
    result: spawnSync('node', [script, '--input', file, ...args], { encoding: 'utf8' }),
  }
}

describe('reading what pnpm reports', () => {
  it('sorts by licence and then by name, so the index is a stable diff', () => {
    expect(flatten(sample).map((r) => r.name)).toEqual(['dual', '@next/env', 'clsx'])
  })

  it('renames pnpm "Unknown" to UNKNOWN, which the policy has an answer for', () => {
    const rows = flatten({ Unknown: [{ name: 'mystery', versions: ['1.0.0'], paths: [] }] })
    expect(rows[0].license).toBe('UNKNOWN')
  })
})

describe('the policy', () => {
  it('passes a closure of permissive licences', () => {
    expect(violations(flatten(sample))).toEqual([])
  })

  it('names why GPL-2.0-only cannot ship, rather than only that it is unlisted', () => {
    const rows = flatten({ 'GPL-2.0-only': [{ name: 'old', versions: ['1.0.0'], paths: [] }] })
    expect(violations(rows)[0].reason).toContain('Commons Clause')
  })

  it('refuses a licence nobody has decided about, rather than assuming it is fine', () => {
    const rows = flatten({ 'Weird-1.0': [{ name: 'novel', versions: ['1.0.0'], paths: [] }] })
    expect(violations(rows)).toHaveLength(1)
    expect(violations(rows)[0].reason).toContain('Not in the policy')
  })

  it('treats a package that declares nothing as all rights reserved', () => {
    const rows = flatten({ Unknown: [{ name: 'mystery', versions: ['1.0.0'], paths: [] }] })
    expect(violations(rows)[0].reason).toContain('all rights reserved')
  })
})

describe('the committed index', () => {
  /**
   * The decision this guards: with versions in the file, every Dependabot bump
   * would rewrite it and fail a check the bot cannot fix.
   */
  it('carries no version numbers', () => {
    expect(renderIndex(flatten(sample))).not.toContain('2.1.1')
  })

  it('groups by licence and links the homepage where there is one', () => {
    const index = renderIndex(flatten(sample))
    expect(index).toContain('## MIT')
    expect(index).toContain('[clsx](https://clsx.dev)')
    expect(index).toContain('- @next/env')
  })
})

describe('the notice file that ships inside the image', () => {
  it('says so when a package shipped no licence text, instead of leaving a gap', () => {
    const { text, silent } = renderNotices(flatten(sample))
    expect(silent).toContain('clsx')
    expect(text).toContain('[No licence file in the published package.')
  })

  it('keeps the blank lines that make it readable', () => {
    const { text } = renderNotices(flatten(sample))
    expect(text).toContain('\n\n')
  })
})

describe('the SBOM', () => {
  const meta = { name: 'goodworkshop', version: '0.3.1', timestamp: '2026-09-13T00:00:00.000Z' }

  it('encodes a scoped package the way the purl spec does', () => {
    const doc = renderSbom(flatten(sample), meta)
    const scoped = doc.components.find((c) => c.name === '@next/env')
    expect(scoped.purl).toBe('pkg:npm/%40next/env@16.3.5')
  })

  it('uses an expression for a compound licence and an id for a plain one', () => {
    const doc = renderSbom(flatten(sample), meta)
    expect(doc.components.find((c) => c.name === 'dual').licenses).toEqual([
      { expression: 'Apache-2.0 AND MIT' },
    ])
    expect(doc.components.find((c) => c.name === 'clsx').licenses).toEqual([
      { license: { id: 'MIT' } },
    ])
  })

  it('gives the same closure the same serial number, so two builds compare equal', () => {
    const a = renderSbom(flatten(sample), meta)
    const b = renderSbom(flatten(sample), { ...meta, timestamp: '2027-01-01T00:00:00.000Z' })
    expect(a.serialNumber).toBe(b.serialNumber)
    expect(a.serialNumber).toMatch(/^urn:uuid:[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/)
  })

  it('names the project itself as the subject of the document', () => {
    const doc = renderSbom(flatten(sample), meta)
    expect(doc.metadata.component.purl).toBe('pkg:npm/goodworkshop@0.3.1')
    expect(doc.metadata.component.licenses).toEqual([
      { expression: 'Apache-2.0 AND LicenseRef-Commons-Clause-1.0' },
    ])
  })
})

describe('run from the command line', () => {
  it('fails, and says which package, when something may not ship', () => {
    const { result } = run({
      'BUSL-1.1': [{ name: 'sourceavailable', versions: ['1.0.0'], paths: [] }],
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('sourceavailable')
    expect(result.stderr).toContain('beyond our own terms')
  })

  it('writes an SBOM a consumer can actually parse', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'sbom-')), 'bom.json')
    const { result } = run(sample, '--sbom', out)
    expect(result.status).toBe(0)

    const doc = JSON.parse(readFileSync(out, 'utf8'))
    expect(doc.bomFormat).toBe('CycloneDX')
    expect(doc.specVersion).toBe('1.6')
    expect(doc.components.map((c) => c.name)).toContain('clsx')
    // Every component needs the three fields a scanner joins advisories on.
    for (const component of doc.components) {
      expect(component).toMatchObject({
        name: expect.any(String),
        version: expect.any(String),
        purl: expect.stringMatching(/^pkg:npm\//),
      })
    }
  })

  it('reports a stale index rather than quietly regenerating it', () => {
    const { result } = run(sample)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('licenses:write')
  })
})

describe('platform binaries in the index', () => {
  /**
   * Without this the committed index would depend on the operating system of
   * whoever last regenerated it, and CI would be red for everybody else.
   */
  it.each([
    ['@img/sharp-darwin-arm64', '@img/sharp-*'],
    ['@img/sharp-linux-x64-gnu', '@img/sharp-*'],
    ['@img/sharp-libvips-darwin-arm64', '@img/sharp-libvips-*'],
    ['@next/swc-win32-ia32-msvc', '@next/swc-*'],
    ['@parcel/watcher-linux-x64-glibc', '@parcel/watcher-*'],
    // sharp spells the libc into the platform token. This is what is actually
    // inside the published Alpine image.
    ['@img/sharp-linuxmusl-arm64', '@img/sharp-*'],
    ['@img/sharp-libvips-linuxmusl-arm64', '@img/sharp-libvips-*'],
    ['@swc/core-linux-arm64-musl', '@swc/core-*'],
    ['lightningcss-linux-arm64-musl', 'lightningcss-*'],
    ['@esbuild/darwin-arm64', '@esbuild/*'],
  ])('collapses %s', (name, expected) => {
    expect(canonicalName(name)).toBe(expected)
  })

  /**
   * An ASN.1 schema for Android key attestation, not an Android binary. A
   * looser rule -- one that fires on the platform name alone -- eats it, and
   * the index then hides a real dependency behind a wildcard.
   */
  it.each(['@peculiar/asn1-android', 'sharp', '@swc/core', 'node-linux-helper'])(
    'leaves %s alone',
    (name) => {
      expect(canonicalName(name)).toBe(name)
    },
  )

  it('renders one line for six platform variants of the same package', () => {
    const rows = flatten({
      'Apache-2.0': [
        { name: '@img/sharp-darwin-arm64', versions: ['0.34.0'], paths: [] },
        { name: '@img/sharp-linux-x64', versions: ['0.34.0'], paths: [] },
      ],
    })
    const lines = renderIndex(rows)
      .split('\n')
      .filter((l) => l.includes('sharp'))
    expect(lines).toEqual(['- @img/sharp-*'])
  })
})

describe('the policy after leaving AGPL', () => {
  /**
   * The direction flipped with the licence. Under AGPL, GPL-3.0 code was
   * welcome; under the Commons Clause it is the one thing that cannot ship,
   * because GPL forbids exactly the restriction the Clause adds.
   */
  it.each(['GPL-3.0-only', 'GPL-3.0-or-later', 'AGPL-3.0-only', 'AGPL-3.0-or-later'])(
    'refuses %s, and says it is the Commons Clause that conflicts',
    (license) => {
      const rows = flatten({ [license]: [{ name: 'copyleft', versions: ['1.0.0'], paths: [] }] })
      expect(violations(rows)).toHaveLength(1)
      expect(violations(rows)[0].reason).toContain('Commons Clause')
    },
  )

  it('still ships the LGPL library sharp depends on', () => {
    const rows = flatten({
      'LGPL-3.0-or-later': [
        { name: '@img/sharp-libvips-linux-x64', versions: ['1.0.0'], paths: [] },
      ],
    })
    expect(violations(rows)).toEqual([])
  })
})
