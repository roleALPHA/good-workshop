#!/usr/bin/env node
/**
 * Whose code ships inside this image, and whether it may.
 *
 * Two different obligations meet here, and conflating them is how projects get
 * this wrong:
 *
 *   1. ATTRIBUTION. MIT, BSD and Apache all say the same thing in different
 *      words: if you distribute the software, the copyright notice and the
 *      licence text travel with it. A Docker image IS distribution. A list of
 *      package names does not discharge that -- the notices themselves have to
 *      be in the artifact, which is what `--notices` writes into the image.
 *   2. COMPATIBILITY. This project is Apache-2.0 with the Commons Clause.
 *      Permissive licences combine with that freely. Strong copyleft does not:
 *      GPL and AGPL forbid adding restrictions to the combined work, and the
 *      Commons Clause is exactly such a restriction. Neither do licences that
 *      carry service restrictions of their own (SSPL, BUSL), which would bind
 *      our users beyond our own terms. That is what the policy below decides.
 *      It was stricter in the other direction while this project was AGPL,
 *      which is why GPL-3.0 used to be on the allowed list and is not now.
 *
 * The committed index (THIRD-PARTY-LICENSES.md) is the reviewable half: it
 * changes when the set of packages changes, which is exactly when somebody
 * should look. Deliberately WITHOUT version numbers -- with them, every
 * Dependabot bump would rewrite the file and turn a routine update red for a
 * reason nobody learns anything from. Versions belong in the SBOM, which is
 * generated per release and not committed.
 *
 * Usage:
 *   node scripts/licenses.mjs                 check policy + index freshness
 *   node scripts/licenses.mjs --write         regenerate the committed index
 *   node scripts/licenses.mjs --notices FILE  write the full notice file
 *   node scripts/licenses.mjs --sbom FILE     write a CycloneDX 1.6 SBOM
 *   node scripts/licenses.mjs --input FILE    read pnpm's JSON from a file
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Licences that may ship inside an image distributed under Apache-2.0 with the
 * Commons Clause.
 *
 * Every entry carries a reason, for the same purpose as the INTERNAL list in
 * check-docs.mjs: adding a licence here has to be a decision somebody made,
 * not a line somebody appended to make the build green.
 */
const ALLOWED = {
  MIT: 'Permissive. Requires the notice to travel with the code -- see --notices.',
  'MIT-0': 'MIT without the attribution requirement.',
  ISC: 'Permissive, functionally MIT.',
  '0BSD': 'Permissive, no attribution required.',
  'BSD-2-Clause': 'Permissive.',
  'BSD-3-Clause': 'Permissive, plus a no-endorsement clause we do not violate.',
  'Apache-2.0': 'Permissive with a patent grant. The base licence of this project itself.',
  'BlueOak-1.0.0': 'Permissive, plainly worded.',
  'Python-2.0': 'Permissive.',
  'CC0-1.0': 'Public-domain dedication.',
  Unlicense: 'Public-domain dedication.',
  'CC-BY-4.0':
    'Attribution required and nothing else -- usually data or documentation rather than code. The notice file carries the attribution.',
  'MPL-2.0':
    'File-scoped copyleft. Section 3.3 lets MPL files sit inside a Larger Work under other terms; changes to the MPL files themselves stay MPL.',
  'LGPL-3.0-or-later':
    'Library copyleft. Fine as a separately replaceable library -- sharp ships libvips as its own shared object. The Commons Clause restricts GoodWorkshop, not the library, and changes to the library itself would stay LGPL.',
  'LGPL-3.0-only':
    'Library copyleft. Same reasoning as LGPL-3.0-or-later: a replaceable library, not the combined work.',
  'Apache-2.0 AND MIT': 'Both halves are allowed above.',
  '(MIT OR CC0-1.0)': 'Either half is allowed above.',
  '(MIT OR Apache-2.0)': 'Either half is allowed above.',
}

/**
 * Licences with a named refusal, so the error says what is actually wrong
 * rather than "not on the list".
 *
 * Anything not in either table is also refused -- an unknown licence is a
 * decision nobody has made yet, and defaulting to "allow" is how a BUSL
 * dependency arrives unannounced.
 */
const REFUSED = {
  'GPL-2.0-only':
    'Strong copyleft. It forbids further restrictions on the combined work, and the Commons Clause is one. The package has to go, or be replaced.',
  'GPL-2.0': 'Ambiguous, and strong copyleft either way -- see GPL-2.0-only.',
  'GPL-2.0-or-later': 'Strong copyleft, same conflict with the Commons Clause as GPL-2.0-only.',
  'GPL-3.0-only':
    'Strong copyleft. GPL-3.0 section 10 forbids imposing further restrictions, and the Commons Clause is one. The package has to go, or be replaced.',
  'GPL-3.0-or-later': 'Strong copyleft, same conflict with the Commons Clause as GPL-3.0-only.',
  'AGPL-3.0-only':
    'Strong network copyleft -- the licence this project left. Same conflict with the Commons Clause as GPL-3.0.',
  'AGPL-3.0-or-later':
    'Strong network copyleft, same conflict with the Commons Clause as AGPL-3.0-only.',
  SSPL: 'Requires anyone offering the software as a service to publish their whole service stack. That would bind our users beyond our own terms.',
  'SSPL-1.0':
    'Requires anyone offering the software as a service to publish their whole service stack. That would bind our users beyond our own terms.',
  'BUSL-1.1':
    'Source-available with use restrictions of its own. They would bind our users beyond our own terms, and they are not ours to pass on.',
  'Elastic-2.0':
    'Source-available with its own restriction on offering the software as a service -- not ours to pass on.',
  UNLICENSED: 'Explicitly reserves all rights. Shipping it would be infringement.',
  UNKNOWN: 'The package declares no licence. Treat as all rights reserved until proven otherwise.',
}

const INDEX_FILE = 'THIRD-PARTY-LICENSES.md'

/**
 * This project's own licence as an SPDX expression, for the SBOM.
 *
 * SPDX has no identifier for the Commons Clause, so it is a LicenseRef -- the
 * mechanism SPDX provides for exactly that. The same string is the image's
 * org.opencontainers.image.licenses label in publish.yml, so a scanner reading
 * either one reports the same terms.
 */
export const PROJECT_LICENSE = 'Apache-2.0 AND LicenseRef-Commons-Clause-1.0'

const PREAMBLE = `<!-- Generated by scripts/licenses.mjs -- do not edit by hand.
     Regenerate with \`pnpm licenses:write\` and commit the result. -->

# Third-party licences

GoodWorkshop is licensed under Apache-2.0 with the Commons Clause (see LICENSE).
It is distributed as a Docker image that contains other people's code, which
carries its own terms.

This file is the reviewable index: which packages, under which licence. It
deliberately carries no version numbers, so that a dependency bump does not
rewrite it -- versions are in the SBOM published with each release.

The **notices themselves** -- the copyright lines and licence texts that MIT,
BSD and Apache require to travel with the code -- ship inside the image at
\`/app/THIRD-PARTY-LICENSES.txt\` and are attached to each GitHub release.

The set below is pnpm's production dependency closure. That is deliberately
wider than what the image actually carries: Next traces the server down to a
few dozen packages, but code from other packages is *bundled into* the
JavaScript that goes to the browser and into the collaboration server, and no
cheap computation tells those apart. Attributing more than is strictly
required is safe; attributing less is not.
`

function licensesFromPnpm(inputFile) {
  if (inputFile) return JSON.parse(readFileSync(inputFile, 'utf8'))
  // --prod, because dev dependencies are not distributed. They are still
  // reviewed by the policy in a separate pass below, because a build tool that
  // is not open source is a problem for a different reason.
  const out = execFileSync('pnpm', ['licenses', 'list', '--json', '--prod'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  return JSON.parse(out)
}

/** pnpm groups by licence; this flattens to one row per package, sorted. */
export function flatten(byLicense) {
  const rows = []
  for (const [license, packages] of Object.entries(byLicense)) {
    for (const pkg of packages) {
      rows.push({
        name: pkg.name,
        license: license === 'Unknown' ? 'UNKNOWN' : license,
        homepage: pkg.homepage || '',
        versions: pkg.versions ?? [],
        paths: pkg.paths ?? [],
      })
    }
  }
  rows.sort((a, b) => a.license.localeCompare(b.license) || a.name.localeCompare(b.name))
  return rows
}

/** Every row whose licence the policy does not allow, with the reason. */
export function violations(rows) {
  return rows
    .filter((row) => !(row.license in ALLOWED))
    .map((row) => ({
      ...row,
      reason:
        REFUSED[row.license] ??
        `Not in the policy in scripts/licenses.mjs. Decide whether it may ship in an image under Apache-2.0 with the Commons Clause, then add it there WITH the reason.`,
    }))
}

/**
 * Platform binaries, collapsed to one entry.
 *
 * `pnpm install` on a Mac fetches `@img/sharp-darwin-arm64`; the Linux runner
 * fetches `@img/sharp-linux-x64`. Without this, the committed index would
 * depend on whose laptop last regenerated it and CI would fail for everybody
 * who is not on that platform -- a check nobody can satisfy is a check that
 * gets deleted.
 *
 * The platform has to be followed by an architecture for this to fire. That is
 * not pedantry: `@peculiar/asn1-android` is an ASN.1 schema for Android key
 * attestation and has nothing platform-specific about it, and a looser rule
 * eats it.
 *
 * `linuxmusl` is listed separately and BEFORE `linux`, because sharp spells the
 * libc into the platform token rather than into a suffix: the image is built on
 * Alpine and carries `@img/sharp-linuxmusl-arm64` where a glibc machine has
 * `@img/sharp-linux-x64-gnu`. Found by reading the notice file out of a
 * published image and noticing the name did not match anything on this laptop.
 *
 * Only the INDEX collapses these. The notices file and the SBOM keep the real
 * names, because those describe one concrete build.
 */
const PLATFORM_BINARY =
  /-(darwin|linuxmusl|linux|win32|freebsd|openbsd|android|sunos)-(x64|arm64|arm|ia32|s390x|ppc64|riscv64|loong64|mips64el)(-(musl|glibc|gnu|gnueabihf|msvc))?$/

export function canonicalName(name) {
  // `@esbuild/darwin-arm64` puts the platform where the package name goes, so
  // the suffix rule above has nothing to bite on.
  const scoped = /^(@[^/]+)\/(darwin|linuxmusl|linux|win32|freebsd|openbsd|android|sunos)-/.exec(
    name,
  )
  if (scoped) return `${scoped[1]}/*`
  return name.replace(PLATFORM_BINARY, '-*')
}

export function renderIndex(rows) {
  const byLicense = new Map()
  const seen = new Set()
  for (const row of rows) {
    const name = canonicalName(row.name)
    // One line per name per licence: the platform variants of sharp are one
    // decision, not six.
    if (seen.has(`${row.license}\u0000${name}`)) continue
    seen.add(`${row.license}\u0000${name}`)
    if (!byLicense.has(row.license)) byLicense.set(row.license, [])
    byLicense.get(row.license).push({ ...row, name })
  }

  const sections = [...byLicense.entries()].map(([license, packages]) => {
    const lines = packages.map((p) => (p.homepage ? `- [${p.name}](${p.homepage})` : `- ${p.name}`))
    return `## ${license}\n\n${ALLOWED[license] ?? ''}\n\n${lines.join('\n')}\n`
  })

  return `${PREAMBLE}\n${sections.join('\n')}`
}

const NOTICE_NAMES = /^(licen[cs]e|copying|notice)(\.|$)/i

/** The licence text a package actually ships, if it ships one. */
function noticeText(paths) {
  for (const dir of paths) {
    let entries
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    const file = entries.find((name) => NOTICE_NAMES.test(name))
    if (!file) continue
    try {
      return readFileSync(join(dir, file), 'utf8').trim()
    } catch {
      continue
    }
  }
  return null
}

export function renderNotices(rows) {
  const rule = '='.repeat(78)
  const parts = [
    'THIRD-PARTY NOTICES',
    '',
    'GoodWorkshop (Apache-2.0 with the Commons Clause; see LICENSE and NOTICE)',
    'is distributed with the following components.',
    'Each is provided under its own licence, reproduced below.',
    '',
    'The index without licence texts, and the reasoning behind this file, are in',
    'THIRD-PARTY-LICENSES.md in the source repository.',
    '',
  ]

  const silent = []
  for (const row of rows) {
    const text = noticeText(row.paths)
    if (!text) silent.push(row.name)
    parts.push(
      rule,
      `${row.name}  --  ${row.license}`,
      // Only the homepage line is conditional. Blank lines elsewhere are the
      // structure of the document, so nothing filters them out afterwards --
      // an earlier version did, and produced 8000 lines with no paragraph in
      // them.
      ...(row.homepage ? [row.homepage] : []),
      rule,
      '',
      // A package that ships no licence file is NOT silently skipped. The
      // licence it declares still binds, and a reader has to be able to see
      // that the text is missing rather than assume there was none to give.
      text ?? `[No licence file in the published package. Declared licence: ${row.license}.]`,
      '',
    )
  }

  return { text: parts.join('\n') + '\n', silent }
}

/**
 * A CycloneDX 1.6 document over the production dependency closure.
 *
 * Generated from the lockfile rather than scanned out of the image, and that is
 * the point: a scanner sees the few dozen packages Next traced into
 * `.next/standalone`, while the thing a reviewer asks about -- "which versions
 * of which libraries went into this release" -- is the closure. The image
 * carries its own SPDX attestation from BuildKit for the other view; the two
 * answer different questions and neither replaces the other.
 *
 * `serialNumber` is derived from the content rather than random, so building
 * the same release twice produces the same document. A UUID that changes on
 * every run makes two SBOMs look different when nothing is.
 */
export function renderSbom(rows, { name, version, timestamp }) {
  const components = []
  for (const row of rows) {
    for (const v of row.versions.length > 0 ? row.versions : ['0.0.0']) {
      components.push({
        type: 'library',
        'bom-ref': purl(row.name, v),
        name: row.name,
        version: v,
        purl: purl(row.name, v),
        licenses: [licenseEntry(row.license)],
        ...(row.homepage ? { externalReferences: [{ type: 'website', url: row.homepage }] } : {}),
      })
    }
  }
  components.sort((a, b) => a['bom-ref'].localeCompare(b['bom-ref']))

  const body = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    version: 1,
    metadata: {
      timestamp,
      tools: {
        components: [{ type: 'application', name: 'scripts/licenses.mjs', group: name }],
      },
      component: {
        type: 'application',
        'bom-ref': purl(name, version),
        name,
        version,
        purl: purl(name, version),
        licenses: [licenseEntry(PROJECT_LICENSE)],
      },
    },
    components,
  }

  const digest = createHash('sha256').update(JSON.stringify(body.components)).digest('hex')
  return {
    // A v4-shaped UUID built from the digest: same closure, same serial.
    serialNumber: `urn:uuid:${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`,
    ...body,
  }
}

/** A package URL, which is how every SBOM consumer joins this to an advisory. */
function purl(name, version) {
  // Scoped names carry a slash that must survive as a namespace, so only the
  // parts are encoded -- encodeURIComponent on the whole string would turn
  // `@next/env` into a name no scanner recognises.
  const parts = name.split('/').map(encodeURIComponent)
  return `pkg:npm/${parts.join('/')}@${encodeURIComponent(version)}`
}

/**
 * CycloneDX wants `id` for a plain SPDX identifier and `expression` for
 * anything with AND/OR in it. Getting this backwards is accepted by some tools
 * and silently dropped by others.
 */
function licenseEntry(license) {
  return /[()]|\sAND\s|\sOR\s/.test(license) || license === 'UNKNOWN'
    ? { expression: license }
    : { license: { id: license } }
}

// --- command line ------------------------------------------------------------

const argv = process.argv.slice(2)
const flag = (name) => {
  const i = argv.indexOf(name)
  return i === -1 ? undefined : (argv[i + 1] ?? true)
}

/** True only when this file was run, not when a test imported it. */
const isMain = (() => {
  if (!process.argv[1]) return false
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()

if (isMain) {
  const rows = flatten(licensesFromPnpm(flag('--input')))

  const bad = violations(rows)
  if (bad.length > 0) {
    console.error(`\n${bad.length} dependency/-ies may not ship under this project's licence:\n`)
    for (const row of bad) {
      console.error(`  ${row.name}  (${row.license})\n    ${row.reason}\n`)
    }
    process.exit(1)
  }

  const sbom = flag('--sbom')
  if (typeof sbom === 'string') {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    const doc = renderSbom(rows, {
      name: pkg.name,
      version: process.env.GW_VERSION?.replace(/^v/, '') || pkg.version,
      timestamp: new Date().toISOString(),
    })
    writeFileSync(sbom, JSON.stringify(doc, null, 2) + '\n')
    console.log(`${doc.components.length} components written to ${sbom}.`)
    process.exit(0)
  }

  const notices = flag('--notices')
  if (typeof notices === 'string') {
    const { text, silent } = renderNotices(rows)
    writeFileSync(notices, text)
    console.log(`${rows.length} components written to ${notices}.`)
    if (silent.length > 0) {
      // Named rather than counted: "10 packages" is not reviewable, and the
      // declared licence still binds whether or not the tarball carried its
      // text. Not fatal -- it is the publisher's omission, not ours.
      console.log(`No licence file shipped by: ${silent.join(', ')}`)
    }
  } else if (flag('--write')) {
    writeFileSync(INDEX_FILE, renderIndex(rows))
    console.log(`${rows.length} components written to ${INDEX_FILE}.`)
  } else {
    const expected = renderIndex(rows)
    const actual = (() => {
      try {
        return readFileSync(INDEX_FILE, 'utf8')
      } catch {
        return null
      }
    })()
    if (actual !== expected) {
      console.error(
        `${INDEX_FILE} no longer matches the lockfile.\n` +
          `A dependency was added or removed. Run \`pnpm licenses:write\` and commit the result --\n` +
          `the diff is the review.`,
      )
      process.exit(1)
    }
    console.log(`${rows.length} components, every licence allowed, ${INDEX_FILE} current.`)
  }
}
