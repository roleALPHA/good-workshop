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
  /** Set aside, or brought back. See ModuleDto.parked. */
  parked?: boolean
}

/** A section header. Only its start time is editable from the agenda today. */
export type ClusterPatch = {
  pinnedStartMinute?: number | null
}

export type NewBlock = {
  moduleTypeId: string
  title: string
  durationMinutes: number
}

/**
 * Somebody else in the room.
 *
 * `kind` is not decoration. An LLM writing through MCP joins the room like a
 * person does, and a name alone would let it pass for a colleague -- whoever
 * is watching their agenda change under their hands is owed the difference.
 *
 * The colour is an OKLCH hue rather than a token name, so presence never
 * borrows the category palette. Category colours mean "this is a break"; a
 * person is not a category, and the two must not read as the same language.
 */
export type Peer = {
  clientId: number
  name: string
  hue: number
  kind: 'person' | 'model'
  /** The block they are editing right now, if any. */
  focusedBlockId: string | null
}

export type AgendaDocument = {
  /** The current day, derived. Never mutated in place. */
  doc: DayDoc
  patchModule: (moduleId: string, patch: ModulePatch) => void
  patchCluster: (clusterId: string, patch: ClusterPatch) => void
  /** Fields that belong to the day itself rather than to a block. */
  patchDay: (patch: { desc?: Record<string, unknown> }) => void
  /** Applies a finished drag. */
  move: (blockId: string, projection: Projection) => void
  addModule: (block: NewBlock) => void
  removeModule: (moduleId: string) => void
  /** How the change is being shared, for the UI to report honestly. */
  status: DocumentStatus
  /** Who else is here. Empty when nothing is shared. */
  peers: Peer[]
  /** Tells the others which block this person is in. */
  setFocus: (blockId: string | null) => void
}

export type DocumentStatus =
  | { kind: 'local' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'connecting' }
  | { kind: 'live'; peers: number }
  /**
   * Carries no message: what "offline" means is the same sentence every time,
   * and it belongs in the catalog next to the rest of the interface rather
   * than in a hook that has no language. `error` keeps one, because that text
   * comes from somewhere real and is not ours to write.
   */
  | { kind: 'offline' }
  | { kind: 'error'; message: string }
