import { describe, expect, it } from 'vitest'
import { createDemoDay } from './fixtures/day-fixture'
import { removeFromDay } from './remove'

/**
 * Deleting a row in the demo, which keeps its day in React state rather than
 * in the shared document. It has to agree with removeBlock in
 * src/domain/collab/ops.ts: the demo is what people try before they sign up,
 * and a demo that deletes differently is a demo of something else.
 */

const inCluster = (doc: ReturnType<typeof createDemoDay>, clusterId: string) =>
  doc.modules.filter((m) => m.clusterId === clusterId)

describe('removing a row from a local day', () => {
  it('takes a section and its scheduled blocks with it', () => {
    const doc = createDemoDay()
    const inside = inCluster(doc, 'cl-1').map((m) => m.id)
    expect(inside.length).toBeGreaterThan(0)

    const after = removeFromDay(doc, 'cl-1')
    expect(after.clusters.some((c) => c.id === 'cl-1')).toBe(false)
    expect(after.modules.some((m) => inside.includes(m.id))).toBe(false)
  })

  it('keeps a parked block of a deleted section, on the day level and still parked', () => {
    const base = createDemoDay()
    const victim = inCluster(base, 'cl-1')[0]!
    const doc = {
      ...base,
      modules: base.modules.map((m) => (m.id === victim.id ? { ...m, parked: true } : m)),
    }

    const after = removeFromDay(doc, 'cl-1')
    const kept = after.modules.find((m) => m.id === victim.id)
    expect(kept).toMatchObject({ clusterId: null, parked: true })
    // Behind everything else on the day, so it does not jump into the middle.
    const dayLevel = [
      ...after.modules.filter((m) => m.clusterId === null && m.id !== victim.id),
      ...after.clusters.filter((c) => c.parentClusterId === null),
    ].map((row) => row.order)
    expect(kept!.order).toBeGreaterThan(Math.max(...dayLevel))
  })

  it('takes a breakout with its strands and their blocks', () => {
    const doc = createDemoDay()
    const strandBlocks = [...inCluster(doc, 'bo-s1'), ...inCluster(doc, 'bo-s2')].map((m) => m.id)

    const after = removeFromDay(doc, 'bo-1')
    expect(after.clusters.map((c) => c.id)).not.toEqual(
      expect.arrayContaining(['bo-1', 'bo-s1', 'bo-s2']),
    )
    expect(after.clusters.some((c) => c.parentClusterId === 'bo-1')).toBe(false)
    expect(after.modules.some((m) => strandBlocks.includes(m.id))).toBe(false)
  })

  it('removes a single block and nothing else', () => {
    const doc = createDemoDay()
    const target = doc.modules[0]!
    const after = removeFromDay(doc, target.id)
    expect(after.modules).toHaveLength(doc.modules.length - 1)
    expect(after.clusters).toEqual(doc.clusters)
  })
})
