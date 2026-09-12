import type * as Y from 'yjs'
import { moveBlock } from '@/domain/collab/ops'
import type { Projection } from '@/features/agenda/projection'

// Clusters and modules are the same blocks in the document, so one patch
// function serves both. Named twice because the editor's two call sites mean
// different things by it.
export {
  patchBlock as patchModule,
  patchBlock as patchCluster,
  removeBlock as removeModule,
} from '@/domain/collab/ops'
export { addModuleBlock as addModule } from '@/domain/collab/ops'

/**
 * Applies a finished drag.
 *
 * Two field writes on one block: a new parent and a new sort key. That is the
 * whole reason for fractional ordering -- two people dragging different blocks
 * touch different rows and never conflict.
 *
 * Which is the same operation an LLM performs through MCP, so it is the same
 * code: the projection already names the sibling to land behind, and moving a
 * block behind a named sibling is what the shared ops module does.
 */
export function applyProjection(doc: Y.Doc, blockId: string, projection: Projection): void {
  if (!projection.valid) return
  moveBlock(doc, blockId, projection.depth === 0 ? null : projection.parentId, projection.afterId)
}
