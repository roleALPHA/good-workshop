import { Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'
import type { CategoryColor } from '@/lib/category-colors'
import { ColorSelect } from './color-select'
import { TitleInput } from './inline-inputs'

/**
 * The three things every container has: a name, a colour, and a way out.
 *
 * Shared by a section row, a breakout head and a strand head, because they
 * differ in layout and in what they say about themselves -- not in how they
 * are edited. Keeping the editing here means a fix to the delete affordance
 * lands in all three, and the accessible name is computed the same way
 * everywhere: from the heading, with the field inside it.
 */
export type ChromeEditing = {
  onTitleChange: (title: string) => void
  onColorChange: (color: CategoryColor | null) => void
  autoFocusTitle?: boolean
  onRemove?: () => void
}

export type ClusterChromeProps = {
  titleId: string
  title: string
  color: CategoryColor | null
  editing?: ChromeEditing
  /** The line beside the name: how many children, how long, how many strands. */
  meta: ReactNode
  /** Heading level. A breakout is an h2, a strand inside it an h3. */
  level?: 2 | 3
  labels: {
    title: string
    color: string
    /** What the delete button says where there is room for a word. */
    delete: string
    deleteLabel: string
    deleteHint: string
  }
  /** Anything that has to sit between the meta and the controls, e.g. a warning. */
  children?: ReactNode
}

export function ClusterChrome({
  titleId,
  title,
  color,
  editing,
  meta,
  level = 2,
  labels,
  children,
}: ClusterChromeProps) {
  const Heading = level === 2 ? 'h2' : 'h3'

  return (
    <>
      {editing ? (
        // Inside the heading, not beside it: the row's accessible name is
        // computed from the heading, and an embedded field still answers
        // for it -- which is what the e2e suite looks a section up by.
        <Heading
          id={titleId}
          className="min-w-0 grow basis-full break-words md:min-w-40 md:basis-0"
        >
          <TitleInput
            value={title}
            onCommit={editing.onTitleChange}
            label={labels.title}
            className="text-[15px] text-[var(--cat-fg)]"
            autoFocus={editing.autoFocusTitle}
          />
        </Heading>
      ) : (
        <Heading
          id={titleId}
          className="min-w-0 text-[15px] font-semibold break-words text-[var(--cat-fg)]"
        >
          {title}
        </Heading>
      )}

      <span className="tabular shrink-0 text-[13px] whitespace-nowrap text-[var(--cat-fg)] opacity-80">
        {meta}
      </span>

      {children}

      {editing && (
        <ColorSelect
          value={color}
          onChange={editing.onColorChange}
          label={labels.color}
          // Quiet until the row is touched, like the delete beside it --
          // but never invisible-yet-tappable: on a touch screen there is
          // no hover to reveal it with.
          className="ml-auto shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100"
        />
      )}

      {editing?.onRemove && (
        <button
          type="button"
          onClick={editing.onRemove}
          aria-label={labels.deleteLabel}
          title={labels.deleteHint}
          // 44px under a thumb only: an unconditional one makes every
          // container row 44px tall under a mouse. min-w as well as min-h,
          // because the word no longer supplies the width -- and
          // pointer-coarse:opacity, because hidden by opacity but still
          // hit-testable is the worst of both on a touch screen. The
          // colour select beside it carries the ml-auto for the pair.
          className="inline-flex shrink-0 items-center justify-center gap-1 rounded px-1 text-[13px] text-[var(--cat-fg)] opacity-0 group-focus-within:opacity-80 group-hover:opacity-80 hover:text-[var(--danger-fg)] focus-visible:opacity-100 pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:opacity-100"
        >
          <Trash2 aria-hidden className="size-3.5" />
          {/*
            The word only where there is room for it, as the library rows
            do: the count and the name are on the button as its accessible
            name either way, so nothing goes missing when it is an icon.
          */}
          <span className="hidden lg:inline">{labels.delete}</span>
        </button>
      )}
    </>
  )
}
