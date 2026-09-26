'use client'

/**
 * Our own live region instead of dnd-kit's announcements.
 *
 * dnd-kit hands announcement callbacks an `over` but no drag delta, so
 * describing the projected depth meant reading a ref written by a *different*
 * callback in the same tick -- and that ordering is not guaranteed. It held in
 * one measurement and broke under Playwright, which is exactly the kind of
 * "works on my machine" a live region must not be built on.
 *
 * Rendering the message makes it a pure function of state, like everything else
 * here: whatever the screen shows, the region says.
 */
export function LiveRegion({ message }: { message: string }) {
  return (
    <div role="status" aria-live="assertive" aria-atomic="true" className="sr-only">
      {message}
    </div>
  )
}
