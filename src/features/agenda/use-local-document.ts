'use client'

import { useCallback, useMemo, useState } from 'react'
import type { DayDoc } from '@/domain/agenda/types'
import type { AgendaDocument, ModulePatch, NewBlock, Peer } from './document'
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
      patchDay,
      move,
      addModule,
      removeModule,
      status: { kind: 'local' as const },
      // Nothing is shared, so nobody is here and there is nothing to announce.
      peers: NOBODY,
      setFocus: () => {},
    }),
    [doc, patchModule, patchDay, move, addModule, removeModule],
  )
}

/** One frozen array, so it never re-renders anything by identity. */
const NOBODY: Peer[] = []
