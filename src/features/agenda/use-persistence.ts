'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addModuleAction,
  deleteModuleAction,
  moveClusterAction,
  moveModuleAction,
  patchModuleAction,
} from '@/server/actions/agenda'

/**
 * Sends edits to the server without getting in the way.
 *
 * The local document is updated first and the write follows. That is not a
 * performance trick: an agenda where a duration takes a round trip to change
 * cannot be used while talking to a client, which is exactly when people plan.
 *
 * `contentVersion` is carried along and sent back with every write. If it no
 * longer matches, the server refuses instead of overwriting -- somebody else
 * (another tab, an MCP client, a colleague) changed the workshop meanwhile.
 */

export type PersistenceTarget = { workshopId: string; dayId: string; contentVersion: string }

export type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | { status: 'saved' }
  | { status: 'conflict'; message: string }
  | { status: 'error'; message: string }

export function usePersistence(target: PersistenceTarget | undefined) {
  const [state, setState] = useState<SaveState>({ status: 'idle' })
  const version = useRef(target?.contentVersion)
  // Writes are serialised. Two moves landing out of order would apply the
  // second against a version the first already replaced, and every edit after
  // that would look like a conflict.
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const run = useCallback(
    <T extends { contentVersion: string }>(
      call: (
        expectedVersion: string | undefined,
      ) => Promise<
        | { ok: true; data: T }
        | { ok: false; message: string; error: string; contentVersion?: string }
      >,
    ) => {
      if (!target) return

      queue.current = queue.current.then(async () => {
        setState({ status: 'saving' })
        try {
          const result = await call(version.current)

          if (result.ok) {
            version.current = result.data.contentVersion
            setState({ status: 'saved' })
            return
          }

          if (result.error === 'conflict') {
            // Adopt the server's version so the next write is not refused for
            // the same reason -- but say so, because something the user did not
            // do has changed.
            if (result.contentVersion) version.current = result.contentVersion
            setState({ status: 'conflict', message: result.message })
            return
          }

          setState({ status: 'error', message: result.message })
        } catch {
          setState({ status: 'error', message: 'Keine Verbindung zum Server.' })
        }
      })
    },
    [target],
  )

  const patchModule = useCallback(
    (
      moduleId: string,
      patch: {
        title?: string
        durationMinutes?: number
        pinnedStartMinute?: number | null
        desc?: Record<string, unknown>
      },
    ) => {
      run((expectedVersion) =>
        patchModuleAction({ workshopId: target!.workshopId, moduleId, ...patch, expectedVersion }),
      )
    },
    [run, target],
  )

  const moveModule = useCallback(
    (moduleId: string, clusterId: string | null, afterId: string | null) => {
      run((expectedVersion) =>
        moveModuleAction({
          workshopId: target!.workshopId,
          moduleId,
          dayId: target!.dayId,
          clusterId,
          afterId,
          expectedVersion,
        }),
      )
    },
    [run, target],
  )

  const moveCluster = useCallback(
    (clusterId: string, afterId: string | null) => {
      run((expectedVersion) =>
        moveClusterAction({
          workshopId: target!.workshopId,
          clusterId,
          dayId: target!.dayId,
          afterId,
          expectedVersion,
        }),
      )
    },
    [run, target],
  )

  /**
   * Adding needs the server's answer before the row can exist locally: the id
   * comes from the database. Everything else here is optimistic; this one
   * cannot be, and pretending otherwise would mean inventing an id and
   * reconciling it later for no benefit.
   */
  const addModule = useCallback(
    async (typeKey: string, clusterId: string | null): Promise<string | null> => {
      if (!target) return null
      setState({ status: 'saving' })

      const result = await addModuleAction({
        workshopId: target.workshopId,
        dayId: target.dayId,
        clusterId,
        typeKey,
        expectedVersion: version.current,
      })

      if (!result.ok) {
        setState({ status: 'error', message: result.message })
        return null
      }

      version.current = result.data.contentVersion
      setState({ status: 'saved' })
      return result.data.id
    },
    [target],
  )

  const deleteModule = useCallback(
    (moduleId: string) => {
      run((expectedVersion) =>
        deleteModuleAction({ workshopId: target!.workshopId, moduleId, expectedVersion }),
      )
    },
    [run, target],
  )

  /**
   * Warns before leaving with a write still in flight.
   *
   * Without this, typing a title and immediately closing the tab loses it
   * silently -- the request never gets sent. The browser's own dialog is the
   * only thing that can interrupt a navigation, so this is the one place a
   * modal is right.
   */
  useEffect(() => {
    if (state.status !== 'saving') return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state.status])

  return {
    state,
    patchModule,
    moveModule,
    moveCluster,
    addModule,
    deleteModule,
    enabled: target !== undefined,
  }
}
