import type { RawBlock } from '@/domain/collab/doc'

/**
 * Where the document's blocks belong in the tables.
 *
 * Split out of the materialiser on purpose. The write-path test insists every
 * insert/update/delete on `module` and `cluster` stays in materialize.ts, so
 * the CALLS cannot move -- but the rules about which parent is allowed are
 * pure, and pure rules are an it.each table instead of a database run.
 *
 * The materialiser must not fail on broken nesting: one block whose parent was
 * deleted a second earlier would otherwise freeze the whole day for everybody
 * in the room. Same reasoning as the orphan rescue and as validatedDescs, and
 * the same answer -- take the next best thing and write it down.
 */
export type PlannedModule = RawBlock & { clusterId: string | null }

export type BlockPlan = {
  /** Sections on the day. Written first: a strand's FK points at one. */
  roots: RawBlock[]
  /** Strands, each with a parent that is a breakout on this day. */
  strands: RawBlock[]
  /** Blocks, with clusterId already clamped. */
  modules: PlannedModule[]
  /** Whose parent could not be kept -- for the log, not for an abort. */
  rescued: { id: string; wanted: string; got: string | null }[]
}

export function planBlocks(blocks: RawBlock[]): BlockPlan {
  const byId = new Map(blocks.map((b) => [b.id, b]))
  const isBreakout = (id: string | null): boolean =>
    id !== null && byId.get(id)?.kind === 'cluster' && byId.get(id)?.mode === 'parallel'
  const isSection = (id: string | null): boolean =>
    id !== null && byId.get(id)?.kind === 'cluster' && byId.get(id)?.mode === 'sequential'

  const roots: RawBlock[] = []
  const strands: RawBlock[] = []
  const modules: PlannedModule[] = []
  const rescued: BlockPlan['rescued'] = []

  for (const block of blocks) {
    if (block.kind === 'cluster') {
      // A breakout always sits on the day; a section may be a strand of one.
      // Anything else -- a section under a section, a parent that is a module,
      // an id that is not here, itself -- becomes a section of its own and
      // KEEPS ITS BLOCKS. That is the rescue one level up from the module one.
      const wanted = block.parentId
      if (wanted === null) {
        roots.push(block)
        continue
      }
      if (block.mode === 'sequential' && wanted !== block.id && isBreakout(wanted)) {
        strands.push(block)
        continue
      }
      rescued.push({ id: block.id, wanted, got: null })
      roots.push(block)
      continue
    }

    // A block hangs on a section or on a strand -- never directly on a
    // breakout, which holds strands and nothing else.
    if (block.moduleTypeId === null) continue
    const wanted = block.parentId
    if (wanted === null) {
      modules.push({ ...block, clusterId: null })
      continue
    }
    if (isSection(wanted)) {
      modules.push({ ...block, clusterId: wanted })
      continue
    }
    rescued.push({ id: block.id, wanted, got: null })
    modules.push({ ...block, clusterId: null })
  }

  return { roots, strands, modules, rescued }
}
