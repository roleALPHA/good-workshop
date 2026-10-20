/**
 * The conversions of the public website, as Umami events.
 *
 * Clicks on a link are counted by the `data-umami-event` attribute on the link
 * itself; this is for what happens after a server action answered, where no
 * click marks the moment. The names are a closed list so that a dashboard
 * built on them does not quietly lose a funnel step to a typo.
 *
 * Never pass anything about the person: no address, no company, no plan they
 * typed. An event says *that* something happened, not *who* did it.
 */
export type Conversion = 'signup-submitted' | 'signup-confirmed'

type Umami = { track: (event: string, data?: Record<string, string | number>) => Promise<unknown> }

declare global {
  interface Window {
    umami?: Umami
  }
}

/**
 * Records a conversion and resolves once it is sent, or after `timeoutMs` at
 * the latest -- so a caller about to navigate away can wait for the beacon
 * without a slow counter holding up the visitor. Without the counter loaded
 * (not configured, blocked, a self-hosted build) it resolves at once.
 */
export async function track(
  event: Conversion,
  data?: Record<string, string | number>,
  timeoutMs = 300,
): Promise<void> {
  const umami = typeof window === 'undefined' ? undefined : window.umami
  if (!umami) return
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      umami.track(event, data),
      new Promise((resolve) => (timer = setTimeout(resolve, timeoutMs))),
    ])
  } catch {
    // A counter that fails must never fail the registration it counts.
  } finally {
    clearTimeout(timer)
  }
}
