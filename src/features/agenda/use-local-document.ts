'use client'

import { useCallback, useMemo, useState } from 'react'
import type { DayDoc } from '@/domain/agenda/types'
import type { AgendaDocument, ClusterPatch, ModulePatch, NewBlock, Peer } from './document'
import { applyMove } from './move'
import type { Projection } from './projection'

/**
 * The editor without a server: changes live in this component and nowhere else.
 *
 * What the public demo runs on. A reload brings the fixture back, which is the
 * honest behaviour for a page anyone can open without an account.
 */
export function useLocalDocument(initial: DayDoc): AgendaDocument {
  const [doc, setDoc] = useState(initial)

  const patchDay = useCallback((patch: { desc?: Record<string, unknown> }) => {
    setDoc((current) => ({ ...current, ...(patch.desc === undefined ? {} : { desc: patch.desc }) }))
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

  const addModule = useCallback((block: NewBlock) => {
    setDoc((current) => ({
      ...current,
      modules: [
        ...current.modules,
        {
          id: `local-${crypto.randomUUID()}`,
          clusterId: null,
          moduleTypeId: block.moduleTypeId,
          title: block.title,
          durationMinutes: block.durationMinutes,
          pinnedStartMinute: null,
          desc: {},
          parked: false,
          order: Number.MAX_SAFE_INTEGER,
        },
      ],
    }))
  }, [])

  const removeModule = useCallback((moduleId: string) => {
    setDoc((current) => ({
      ...current,
      modules: current.modules.filter((m) => m.id !== moduleId),
    }))
  }, [])

  return useMemo(
    () => ({
      doc,
      patchModule,
      patchCluster,
      patchDay,
      move,
      addModule,
      removeModule,
      status: { kind: 'local' as const },
      // Nothing is shared, so nobody is here and there is nothing to announce.
      peers: NOBODY,
      setFocus: () => {},
    }),
    [doc, patchModule, patchCluster, patchDay, move, addModule, removeModule],
  )
}

/** One frozen array, so it never re-renders anything by identity. */
const NOBODY: Peer[] = []
