/**
 * The days of a workshop, as the day page sees them.
 *
 * Plain data so it can cross from the server-rendered page into the editor.
 * Where to link is a path prefix rather than a function for the same reason:
 * a member opens `/w/<workshop>/d/<day>`, a guest `/s/d/<day>`, and nothing
 * callable survives the trip to the browser.
 */

export type DayNavItem = { id: string; title: string; date: string | null }

/** A block set aside on another day of the same workshop. */
export type ParkedElsewhere = {
  id: string
  dayId: string
  title: string
  durationMinutes: number
  moduleTypeId: string
}

export type DayNav = {
  workshopId: string
  activeDayId: string
  /** The day id is appended to this. */
  basePath: string
  days: DayNavItem[]
  /** The rest of the workshop's parking area -- this day's own shelf is in its document. */
  parkedElsewhere: ParkedElsewhere[]
  /**
   * Adding, deleting and reordering days, and bringing a block over from
   * another day. Members who may write; not guests, whose session reaches the
   * collaboration room but none of the server actions.
   */
  canManage: boolean
}
