'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { uuidv7 } from 'uuidv7'
import type * as Y from 'yjs'
import { toDayDoc } from '@/domain/collab/doc'
import type { DayDoc } from '@/domain/agenda/types'
import type {
  AgendaDocument,
  DocumentStatus,
  ModulePatch,
  NewBlock,
} from '@/features/agenda/document'
import type { Projection } from '@/features/agenda/projection'
import { CollabProvider, type ConnectionState, type PeerPresence } from './provider'
import { addModule, applyProjection, patchModule, removeModule } from './y-ops'

/**
 * The editor, backed by a shared document.
 *
 * The server-rendered day is the first paint, so nothing flashes while the
 * socket opens. It is not the seed: the room fills the document from the
 * database before anyone syncs against it.
 */

export type CollabTarget = {
  workshopId: string
  dayId: string
  /** Shown to other people as presence. */
  user: { name: string; color: string }
  /**
   * Where the collaboration server is.
   *
   * Configurable rather than derived from the page origin: the usual
   * deployment proxies /collab to it on the same hostname, but a test harness
   * and anyone proxying differently need to say so without a rebuild.
   */
  url?: string
}

export function useCollabDocument(initial: DayDoc, target: CollabTarget): AgendaDocument {
  const providerRef = useRef<CollabProvider | null>(null)
  const [ydoc, setYdoc] = useState<Y.Doc | null>(null)
  const [connection, setConnection] = useState<ConnectionState>('connecting')
  const [peers, setPeers] = useState<PeerPresence[]>([])
  const [pending, setPending] = useState(false)
  // A counter rather than the document itself: a Y.Doc mutates in place, so
  // React would never see it as a new value.
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    // An empty target means "do not connect": the demo and read-only viewers
    // call this hook too, because React does not allow calling it
    // conditionally.
    if (!target.workshopId || !target.dayId) return

    const url = collabUrl(target)
    const provider = new CollabProvider(url, target.user, {
      onState: setConnection,
      onPeers: setPeers,
      onPending: setPending,
      // The document arrives populated -- the room seeds it from the database
      // when it opens. This browser used to do the seeding, which quietly made
      // "somebody opened this page" a precondition for the day existing as a
      // CRDT at all, and an LLM writing through MCP does not open pages.
      onSynced: () => setRevision((n) => n + 1),
    })

    providerRef.current = provider
    setYdoc(provider.doc)

    const bump = () => setRevision((n) => n + 1)
    provider.doc.on('update', bump)

    return () => {
      provider.doc.off('update', bump)
      provider.destroy()
      providerRef.current = null
      setYdoc(null)
    }
    // Only the identity of the day matters; `initial` changes on every server
    // render and must not tear down a live connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.workshopId, target.dayId])

  const doc = useMemo(() => {
    if (!ydoc) return initial
    const derived = toDayDoc(ydoc, initial.moduleTypes)
    // Before the first sync there is nothing to derive; showing the
    // server-rendered day beats showing an empty one.
    return derived ?? initial
    // revision is the dependency that matters: the Y.Doc mutates in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ydoc, revision, initial])

  const withDoc = useCallback((fn: (doc: Y.Doc) => void) => {
    const provider = providerRef.current
    if (provider) fn(provider.doc)
  }, [])

  const status: DocumentStatus = useMemo(() => {
    if (connection === 'offline') {
      return {
        kind: 'offline',
        // Honest about what is and is not lost: the CRDT keeps local changes
        // and replays them on reconnect.
        message: 'Keine Verbindung. Deine Änderungen werden übertragen, sobald sie wieder steht.',
      }
    }
    if (connection === 'connecting') return { kind: 'connecting' }
    // Reported while bytes are still queued, so "has this left my machine" is
    // answerable rather than assumed.
    if (pending) return { kind: 'saving' }
    return { kind: 'live', peers: peers.length }
  }, [connection, peers.length, pending])

  return useMemo(
    () => ({
      doc,
      status,
      patchModule: (moduleId: string, patch: ModulePatch) =>
        withDoc((d) => patchModule(d, moduleId, patch)),
      move: (blockId: string, projection: Projection) =>
        withDoc((d) => applyProjection(d, blockId, projection)),
      addModule: (block: NewBlock) => withDoc((d) => addModule(d, uuidv7(), block)),
      removeModule: (moduleId: string) => withDoc((d) => removeModule(d, moduleId)),
    }),
    [doc, status, withDoc],
  )
}

/** Which block this person has focused, so others can see it. */
export function useReportFocus(): (blockId: string | null) => void {
  return useCallback(() => {}, [])
}

function collabUrl(target: CollabTarget): string {
  const base = new URL(target.url ?? '/collab', window.location.href)
  if (base.protocol === 'https:') base.protocol = 'wss:'
  else if (base.protocol === 'http:') base.protocol = 'ws:'
  base.searchParams.set('workshop', target.workshopId)
  base.searchParams.set('day', target.dayId)
  return base.toString()
}
