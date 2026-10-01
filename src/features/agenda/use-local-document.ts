'use client'

import { useCallback, useMemo, useState } from 'react'
import type { DayDoc } from '@/domain/agenda/types'
import type {
  AgendaDocument,
  ClusterPatch,
  DayPatch,
  ModulePatch,
  NewBlock,
  NewBreakout,
  NewSection,
  Peer,
} from './document'
import { applyMove } from './move'
import type { Projection } from './projection'
import { removeFromDay } from './remove'

/**
 * The editor without a server: changes live in this component and nowhere else.
 *
 * What the public demo runs on. A reload brings the fixture back, which is the
 * honest behaviour for a page anyone can open without an account.
 */
export function useLocalDocument(initial: DayDoc): AgendaDocument {
  const [doc, setDoc] = useState(initial)

  const patchDay = useCallback((patch: DayPatch) => {
    // Undefined means untouched, as everywhere here; `date: null` is a value.
    const changes = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    )
    setDoc((current) => ({ ...current, ...changes }))
  }, [])

  const patchModule = useCallback((moduleId: string, patch: ModulePatch) => {
    // Undefined means "not part of this change", never "clear this field".
    // Spreading the patch as-is would wipe a description every time somebody
    // adjusted a duration -- the callers build a full-shaped patch object and
    // leave the untouched keys undefined.
    const changes = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    )

    setDoc((current) => ({
      ...current,
      modules: current.modules.map((m) => (m.id === moduleId ? { ...m, ...changes } : m)),
    }))
  }, [])

  // The same undefined-means-untouched rule as patchModule, on the other kind
  // of block. Without it the demo would quietly drop a section's pin while the
  // signed-in editor kept it, which is exactly the drift document.ts warns of.
  const patchCluster = useCallback((clusterId: string, patch: ClusterPatch) => {
    const changes = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    )

    setDoc((current) => ({
      ...current,
      clusters: current.clusters.map((c) => (c.id === clusterId ? { ...c, ...changes } : c)),
    }))
  }, [])

  const move = useCallback((blockId: string, projection: Projection) => {
    setDoc((current) => applyMove(current, blockId, projection))
  }, [])

  /**
   * The next free sort key at day level, where clusters and loose blocks share
   * one space. MAX_SAFE_INTEGER would do for a single addition and then tie on
   * the second, leaving flattenDay to decide the order by comparing ids.
   */

  const addModule = useCallback((block: NewBlock) => {
    setDoc((current) => ({
      ...current,
      modules: [
        ...current.modules,
        {
          id: `local-${crypto.randomUUID()}`,
          clusterId: block.clusterId ?? null,
          moduleTypeId: block.moduleTypeId,
          title: block.title,
          durationMinutes: block.durationMinutes,
          pinnedStartMinute: null,
          desc: {},
          parked: false,
          responsible: [],
          order: Number.MAX_SAFE_INTEGER,
        },
      ],
    }))
  }, [])

  const addCluster = useCallback((section: NewSection) => {
    const id = `local-${crypto.randomUUID()}`
    setDoc((current) => ({
      ...current,
      clusters: [...current.clusters, newCluster(id, section, current)],
    }))
    return id
  }, [])

  const addBreakout = useCallback((breakout: NewBreakout) => {
    const id = `local-${crypto.randomUUID()}`
    setDoc((current) => {
      // One state update for the breakout and its strands, so nobody ever
      // renders the half-built thing in between.
      const clusters = [
        ...current.clusters,
        newCluster(id, { title: breakout.title, mode: 'parallel' }, current),
      ]
      breakout.strands.forEach((strand, index) => {
        clusters.push({
          id: `local-${crypto.randomUUID()}`,
          title: strand.title,
          parentClusterId: id,
          mode: 'sequential',
          color: null,
          pinnedStartMinute: null,
          collapsed: false,
          targetDurationMinutes: null,
          order: index,
        })
      })
      return { ...current, clusters }
    })
    return id
  }, [])

  /**
   * Takes a section's scheduled blocks with it, like removeBlock does in the
   * shared ops, and keeps its parked ones -- see removeFromDay.
   */
  const removeModule = useCallback((moduleId: string) => {
    setDoc((current) => removeFromDay(current, moduleId))
  }, [])

  return useMemo(
    () => ({
      doc,
      patchModule,
      patchCluster,
      patchDay,
      move,
      addModule,
      addCluster,
      addBreakout,
      removeModule,
      status: { kind: 'local' as const },
      // Nothing is shared, so nobody is here and there is nothing to announce.
      peers: NOBODY,
      setFocus: () => {},
    }),
    [
      doc,
      patchModule,
      patchCluster,
      patchDay,
      move,
      addModule,
      addCluster,
      addBreakout,
      removeModule,
    ],
  )
}

/** One frozen array, so it never re-renders anything by identity. */
const NOBODY: Peer[] = []

/**
 * The next free sort key at day level, where clusters and loose blocks share
 * one space. MAX_SAFE_INTEGER would do for a single addition and then tie on
 * the second, leaving flattenDay to decide the order by comparing ids.
 */
function nextOrder(current: DayDoc): number {
  return (
    Math.max(
      0,
      ...current.clusters.filter((c) => c.parentClusterId === null).map((c) => c.order),
      ...current.modules.filter((m) => m.clusterId === null).map((m) => m.order),
    ) + 1
  )
}

/** A cluster row, wherever it hangs. Order comes from its own sibling list. */
function newCluster(id: string, section: NewSection, current: DayDoc): DayDoc['clusters'][number] {
  const parentClusterId = section.parentId ?? null
  return {
    id,
    title: section.title,
    parentClusterId,
    mode: section.mode ?? 'sequential',
    color: section.color ?? null,
    pinnedStartMinute: null,
    collapsed: false,
    targetDurationMinutes: null,
    order:
      parentClusterId === null
        ? nextOrder(current)
        : current.clusters.filter((c) => c.parentClusterId === parentClusterId).length,
  }
}
