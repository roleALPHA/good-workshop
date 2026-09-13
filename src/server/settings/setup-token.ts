import { timingSafeEqual } from 'node:crypto'
import { generateSecret } from '@/server/auth/tokens'

/**
 * The instrumentation hook and React server actions are compiled into separate
 * webpack runtimes. Module state is therefore not shared between them even
 * though both runtimes live in the same Node process.
 *
 * A symbol in the global registry gives both bundles one process-local slot.
 * It still disappears on restart, but the key printed by instrumentation is
 * now the same key the setup action checks.
 */
const SETUP_TOKEN = Symbol.for('goodworkshop.setup-token')
const processGlobals = globalThis as typeof globalThis & Record<symbol, unknown>

export function currentSetupToken(): string {
  const existing = processGlobals[SETUP_TOKEN]
  if (typeof existing === 'string') return existing

  const created = generateSecret(24)
  processGlobals[SETUP_TOKEN] = created
  return created
}

export function setupTokenMatches(candidate: string): boolean {
  const expected = Buffer.from(currentSetupToken(), 'utf8')
  const given = Buffer.from(candidate.trim(), 'utf8')
  // Length first: timingSafeEqual throws on a mismatch, and the length of a
  // token is not the secret.
  return expected.length === given.length && timingSafeEqual(expected, given)
}
