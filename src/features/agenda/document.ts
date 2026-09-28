import type { Responsible } from '@/domain/agenda/responsible'
import type { ClusterMode, DayDoc } from '@/domain/agenda/types'
import type { CategoryColor } from '@/lib/category-colors'
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
  /** The whole list of who answers for the block. */
  responsible?: Responsible[]
}

/**
 * The day itself: its note, its name, its date, the hour it starts at.
 * `date: null` clears it.
 */
export type DayPatch = {
  desc?: Record<string, unknown>
  title?: string
  date?: string | null
  /** Minutes since midnight. Every start time on the day is derived from it. */
  startMinute?: number
}

/** A section header: what it is called, what colour it carries, when it starts. */
export type ClusterPatch = {
  pinnedStartMinute?: number | null
  title?: string
  color?: CategoryColor | null
}

export type NewBlock = {
  moduleTypeId: string
  title: string
  durationMinutes: number
  /**
   * The container it belongs in. Left out means day level, at the end.
   *
   * Needed once strands are columns: dragging four blocks into three columns is
   * drudgery, and the column is where you are standing. The same button helps
   * an ordinary section, which is why it is on the contract rather than in the
   * breakout.
   */
  clusterId?: string | null
}

/**
 * A new section. The title comes from the caller rather than from a default in
 * here: the placeholder name is interface text, and interface text is written
 * in the catalog, not in a hook that has no language.
 */
export type NewSection = {
  title: string
  color?: CategoryColor | null
  /** 'parallel' makes it a breakout, whose children are strands. */
  mode?: ClusterMode
  /** The breakout this becomes a strand of. A breakout itself sits on the day. */
  parentId?: string | null
}

/**
 * A breakout and the strands it opens with.
 *
 * One act, not three: a breakout with one strand is not one, and with none it
 * is an empty raster that explains nothing. Created together also means the
 * people sharing the room see one change rather than three flickering past.
 */
export type NewBreakout = {
  title: string
  strands: { title: string }[]
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
  patchDay: (patch: DayPatch) => void
  /** Applies a finished drag. */
  move: (blockId: string, projection: Projection) => void
  addModule: (block: NewBlock) => void
  /**
   * Returns the new section's id. The row it creates is the row the cursor goes
   * to, and nothing else on the way back can name it.
   */
  addCluster: (section: NewSection) => string
  /** Returns the breakout's id; its strands are created with it. */
  addBreakout: (breakout: NewBreakout) => string
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
