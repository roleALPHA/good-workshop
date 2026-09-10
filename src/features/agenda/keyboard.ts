import { KeyboardCode, type KeyboardCoordinateGetter } from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'

/**
 * Vertical keyboard movement only.
 *
 * Left and right are deliberately NOT translated into x coordinates here, even
 * though that is the obvious way to do it. dnd-kit swallows the first
 * horizontal key press of a drag while it settles its own reference
 * coordinates, so "press ArrowLeft once, nothing happens" -- which for a
 * keyboard user is indistinguishable from the feature not existing.
 *
 * Depth is therefore tracked by the editor as an explicit indent counter, and
 * returning undefined here keeps dnd-kit from consuming those keys at all.
 * See AgendaEditor's keyboard indent effect.
 */
export function treeKeyboardCoordinateGetter(): KeyboardCoordinateGetter {
  return (event, args) => {
    if (event.code === KeyboardCode.Left || event.code === KeyboardCode.Right) return undefined
    return sortableKeyboardCoordinates(event, args)
  }
}
