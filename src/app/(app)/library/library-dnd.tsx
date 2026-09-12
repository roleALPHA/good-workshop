'use client'

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import {
  DndContext,
  DragOverlay,
  MeasuringStrategy,
  MouseSensor,
  TouchSensor,
  closestCenter,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { restrictToWindowEdges } from '@dnd-kit/modifiers'
import { Folder as FolderIcon, FileText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { FolderNode } from '@/domain/workshop/repo'
import {
  resolveFolderDrop,
  resolveWorkshopDrop,
  ROOT_DROP_ID,
  type ActiveDrag,
} from '@/features/library/drag'
import {
  getFolderProjection,
  type FolderProjection,
  type FolderRow,
} from '@/features/library/folder-projection'
import { useMediaQuery } from '@/hooks/use-media-query'
import { moveFolderAction } from '@/server/actions/workshop'

/** Matches the `paddingLeft: depth * 12` the sidebar rows are drawn with. */
const INDENT_PX = 12

/**
 * Every one of these objects must keep its identity across renders: `useSensor`
 * memoises on it, and a sensor rebuilt mid-drag takes its listeners with it.
 * The agenda editor documents the symptom in full.
 */
// Enough slop that a click on a handle stays a click.
const MOUSE_OPTIONS = { activationConstraint: { distance: 6 } }
// Long-press, so the list still scrolls under a finger.
const TOUCH_OPTIONS = { activationConstraint: { delay: 200, tolerance: 8 } }
const MEASURING = { droppable: { strategy: MeasuringStrategy.Always } }
const MODIFIERS = [restrictToWindowEdges]

/** dnd-kit keeps its own live region; ours speaks the domain, so its stays quiet. */
const SILENT_ANNOUNCEMENTS: Announcements = {
  onDragStart: () => undefined,
  onDragMove: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
}

export type WorkshopMover = (workshopId: string, title: string, folderId: string | null) => void

type LibraryDragValue = {
  /** False below `md`, where the folder tree is behind a disclosure. */
  dragEnabled: boolean
  active: ActiveDrag | null
  projection: FolderProjection | null
  /** The folder row the pointer is over, for the drop highlight. */
  overId: string | null
  pendingId: string | null
  announce: (message: string) => void
  /** Where a folder's name is turned into "in X" or "at the top level". */
  describeWhere: (folderId: string | null) => string
  /**
   * The list hands its own move function up.
   *
   * A drop must not become a second way to move a workshop: the list keeps its
   * rows in state, and an action fired from here would leave those rows saying
   * the old folder -- which then makes the NEXT drop a no-op, because the drag
   * compares against what the row claims. One mutation, two ways to reach it.
   */
  setWorkshopMover: (move: WorkshopMover | null) => void
}

const LibraryDragContext = createContext<LibraryDragValue>({
  dragEnabled: false,
  active: null,
  projection: null,
  overId: null,
  pendingId: null,
  announce: () => {},
  describeWhere: () => '',
  setWorkshopMover: () => {},
})

export const useLibraryDrag = () => useContext(LibraryDragContext)

/**
 * One drag surface across both halves of the library.
 *
 * The folder tree and the workshop list are siblings in a server component, and
 * a gesture that goes from one to the other needs a single `DndContext` above
 * both. Everything inside stays server-rendered: this wraps the grid and hands
 * it straight back as children.
 *
 * Drag is the accelerator here, not the mechanism. Every row carries a select
 * that does the same thing with a keyboard, with a screen reader and on a phone
 * -- which is why there is no `KeyboardSensor`: a second keyboard path over one
 * operation is a second thing to keep true.
 */
export function LibraryDnd({ folders, children }: { folders: FolderNode[]; children: ReactNode }) {
  const t = useTranslations('library')
  const router = useRouter()
  const dragEnabled = useMediaQuery('(min-width: 768px)')
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  const [active, setActive] = useState<ActiveDrag | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [offsetX, setOffsetX] = useState(0)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const workshopMover = useRef<WorkshopMover | null>(null)

  const sensors = useSensors(
    useSensor(MouseSensor, MOUSE_OPTIONS),
    useSensor(TouchSensor, TOUCH_OPTIONS),
  )

  const rows = useMemo<FolderRow[]>(
    () => folders.map((node) => ({ id: node.id, parentId: node.parentId, depth: node.depth })),
    [folders],
  )

  const projection = useMemo(() => {
    if (active?.kind !== 'folder' || overId === null || overId === ROOT_DROP_ID) return null
    return getFolderProjection(rows, active.id, overId, offsetX, INDENT_PX)
  }, [active, overId, offsetX, rows])

  const announce = useCallback((next: string) => setMessage(next), [])

  const nameOf = useCallback(
    (folderId: string | null) => folders.find((node) => node.id === folderId)?.name ?? null,
    [folders],
  )

  const where = useCallback(
    (folderId: string | null) => {
      const name = nameOf(folderId)
      return name === null ? t('atTopLevel') : t('inFolder', { name })
    },
    [nameOf, t],
  )

  const setWorkshopMover = useCallback((move: WorkshopMover | null) => {
    workshopMover.current = move
  }, [])

  /**
   * A workshop drag answers to folder rows only, and to nothing else.
   *
   * `pointerWithin` alone, without the agenda's `closestCorners` fallback: in a
   * sortable list every position is a legal answer and "nearest" is a good
   * guess, but here the answer is discrete. Letting go beside the sidebar must
   * mean no drop, not "the folder that happened to be closest".
   */
  const collisionDetection = useCallback<CollisionDetection>(
    (args) =>
      args.active.data.current?.kind === 'folder' ? closestCenter(args) : pointerWithin(args),
    [],
  )

  function handleDragStart(event: DragStartEvent) {
    const data = event.active.data.current as ActiveDrag | undefined
    if (!data) return
    setActive(data)
    setOffsetX(0)
    announce(t('drag.picked', { title: data.kind === 'folder' ? data.name : data.title }))
  }

  function handleDragMove(event: DragMoveEvent) {
    setOffsetX(event.delta.x)
    const over = event.over ? String(event.over.id) : null
    setOverId(over)

    if (!active) return
    const title = active.kind === 'folder' ? active.name : active.title
    if (over === null) return
    announce(
      t('drag.landing', {
        title,
        where: where(over === ROOT_DROP_ID ? null : over),
      }),
    )
  }

  function reset() {
    setActive(null)
    setOverId(null)
    setOffsetX(0)
  }

  function handleDragCancel() {
    reset()
    announce(t('drag.cancelled'))
  }

  /**
   * The drop reads the event, not the state it left behind.
   *
   * `onDragMove` is what keeps `overId` and the offset up to date for the
   * highlight, but the last move before a release does not always arrive --
   * letting go without moving first is the obvious case. Committing from state
   * would then file the workshop wherever the pointer had been a moment ago.
   */
  async function handleDragEnd(event: DragEndEvent) {
    const dragged = active
    const over = event.over ? String(event.over.id) : null
    const projected =
      dragged?.kind === 'folder' && over !== null && over !== ROOT_DROP_ID
        ? getFolderProjection(rows, dragged.id, over, event.delta.x, INDENT_PX)
        : null
    reset()
    if (!dragged) return

    if (dragged.kind === 'workshop') {
      const move = resolveWorkshopDrop(dragged, over)
      if (move) workshopMover.current?.(move.workshopId, dragged.title, move.folderId)
      return
    }

    const node = folders.find((entry) => entry.id === dragged.id)
    if (!node || !projected) return

    const move = resolveFolderDrop(node, { afterId: currentAnchor(rows, node.id) }, projected)
    if (!move) return

    setPendingId(dragged.id)
    const result = await moveFolderAction(move)
    setPendingId(null)

    if (!result.ok) {
      announce(result.message)
      return
    }
    const after = nameOf(move.afterId)
    announce(
      after === null
        ? t('drag.nowFirst', { name: dragged.name })
        : t('drag.nowAfter', { name: dragged.name, after }),
    )
    router.refresh()
  }

  const value = useMemo<LibraryDragValue>(
    () => ({
      dragEnabled,
      active,
      projection,
      overId,
      pendingId,
      announce,
      describeWhere: where,
      setWorkshopMover,
    }),
    [dragEnabled, active, projection, overId, pendingId, announce, where, setWorkshopMover],
  )

  return (
    <LibraryDragContext.Provider value={value}>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        measuring={MEASURING}
        modifiers={MODIFIERS}
        accessibility={{
          announcements: SILENT_ANNOUNCEMENTS,
          screenReaderInstructions: { draggable: t('drag.instructions') },
        }}
        onDragStart={handleDragStart}
        onDragMove={handleDragMove}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {children}

        {/* A compact chip, never a clone of the row: the list is the full width
            of the page and the target is a 200px sidebar, so a ghost in row
            width would cover exactly what you are aiming at. */}
        <DragOverlay dropAnimation={reducedMotion ? null : undefined}>
          {active && (
            <span className="inline-flex max-w-[240px] items-center gap-1.5 rounded border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[14px] shadow-lg">
              {active.kind === 'folder' ? (
                <FolderIcon aria-hidden className="size-3.5 shrink-0" />
              ) : (
                <FileText aria-hidden className="size-3.5 shrink-0" />
              )}
              <span className="truncate">
                {active.kind === 'folder' ? active.name : active.title}
              </span>
            </span>
          )}
        </DragOverlay>

        {/* Named, because dnd-kit keeps a second status region of its own
            that we silence but cannot remove -- two unnamed live regions on one
            page is a guessing game for whoever is listening. */}
        <div
          role="status"
          aria-label={t('drag.region')}
          aria-live="assertive"
          aria-atomic="true"
          className="sr-only"
        >
          {message}
        </div>
      </DndContext>
    </LibraryDragContext.Provider>
  )
}

/** The sibling a folder currently sits behind, so a no-op drop stays a no-op. */
function currentAnchor(rows: FolderRow[], id: string): string | null {
  const index = rows.findIndex((row) => row.id === id)
  if (index === -1) return null
  const depth = rows[index]!.depth
  for (let i = index - 1; i >= 0; i--) {
    if (rows[i]!.depth === depth) return rows[i]!.id
    if (rows[i]!.depth < depth) return null
  }
  return null
}
