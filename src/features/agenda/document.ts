import type { DayDoc } from '@/domain/agenda/types'
import type { Projection } from './projection'

/**
 * What the editor is allowed to do to a day, and nothing about where it lands.
 *
 * The public demo keeps its changes in React state, a signed-in editor writes
 * them into a CRDT that other people are watching. The editor itself must not
 * know which -- otherwise every feature gets written twice and the two copies
 * drift, which is exactly how the demo ends up behaving differently from the
 * real thing.
 */

export type ModulePatch = {
  title?: string
  durationMinutes?: number
  pinnedStartMinute?: number | null
  desc?: Record<string, unknown>
}

export type NewBlock = {
  moduleTypeId: string
  title: string
  durationMinutes: number
}

export type AgendaDocument = {
  /** The current day, derived. Never mutated in place. */
  doc: DayDoc
  patchModule: (moduleId: string, patch: ModulePatch) => void
  /** Applies a finished drag. */
  move: (blockId: string, projection: Projection) => void
  addModule: (block: NewBlock) => void
  removeModule: (moduleId: string) => void
  /** How the change is being shared, for the UI to report honestly. */
  status: DocumentStatus
}

export type DocumentStatus =
  | { kind: 'local' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'connecting' }
  | { kind: 'live'; peers: number }
  | { kind: 'offline'; message: string }
  | { kind: 'error'; message: string }
