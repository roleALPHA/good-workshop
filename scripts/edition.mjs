#!/usr/bin/env node
/**
 * Which edition a build is -- decided once, when it is built.
 *
 * The build reads GW_EDITION from its own environment (the Docker build
 * argument), writes the answer to dist/edition.json, and everything that runs
 * later -- migrate.mjs, provision.mjs -- reads that file, never the variable.
 * An operator can set any environment variable on a container; they cannot
 * rewrite what the image was built as. A self-hosted installation therefore
 * cannot be talked into applying multi-tenant migrations by a line in a .env.
 *
 *   node scripts/edition.mjs write   # at build time, from GW_EDITION
 *   node scripts/edition.mjs         # prints what this build is
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const EDITIONS = ['community', 'cloud']

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'dist', 'edition.json')

/** What the build environment asks for. Build tooling only. */
export function requestedEdition() {
  const value = process.env.GW_EDITION ?? 'community'
  if (!EDITIONS.includes(value)) {
    throw new Error(`GW_EDITION must be one of ${EDITIONS.join(', ')}, not "${value}".`)
  }
  return value
}

/** What this build was built as. Anything missing or unreadable is community. */
export function builtEdition() {
  if (!existsSync(file)) return 'community'
  try {
    const { edition } = JSON.parse(readFileSync(file, 'utf8'))
    return EDITIONS.includes(edition) ? edition : 'community'
  } catch {
    return 'community'
  }
}

export function writeEdition(edition = requestedEdition()) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify({ edition })}\n`)
  return edition
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv[2] === 'write') console.log(`edition: ${writeEdition()}`)
  else console.log(builtEdition())
}
