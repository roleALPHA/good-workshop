import type { WebSocket } from 'ws'
import type { Actor } from '@/server/db'
import { CLOSE_ACCESS_WITHDRAWN, type CollabLimits } from './limits'
import { authorize, sameParticipant, type Credential } from './ws-identity'

/**
 * Asking again.
 *
 * A socket lives for hours, and the web process withdraws access without any line
 * to this one. So a participant is not a check that happened but a credential
 * that is kept -- and asked again on three routes: at once when Postgres says
 * access changed somewhere (see drizzle/0009_access_changed_notify.sql), on a
 * timer in case that message never arrives, and before any message is handled on
 * a check that has grown old. A "no" closes the socket.
 *
 * Each route covers another's failure. Without the timer a lost notification
 * leaves a withdrawn guest writing for as long as they keep the tab open; without
 * the per-message check the message already in flight still gets into the record.
 */

/** Written by the triggers in drizzle/0009_access_changed_notify.sql. */
export const ACCESS_CHANNEL = 'gw_access_changed'

export type Verdict = 'ok' | 'denied' | 'unknown'

export type Participant = {
  ws: WebSocket
  credential: Credential
  actor: Actor
  workshopId: string
  dayId: string
  verifiedAt: number
  /** The check in flight, so a second one queues behind it rather than beside it. */
  checking: Promise<Verdict>
}

/** What the checks need of the server, and no more. */
type Checking = { participants: Set<Participant>; limits: CollabLimits }

/**
 * Asks again, and closes the socket on a "no".
 *
 * Chained onto the previous check rather than reusing it: a notification that
 * arrives while a check is running may be about a change that check started
 * too early to see.
 */
export function revalidate(participant: Participant): Promise<Verdict> {
  const run = async (): Promise<Verdict> => {
    if (participant.ws.readyState !== participant.ws.OPEN) return 'denied'

    let actor: Actor | null
    try {
      actor = await authorize(participant.credential, participant.workshopId, participant.dayId, {
        lock: false,
      })
    } catch (error) {
      console.warn('collab: could not re-check access', { dayId: participant.dayId, error })
      return 'unknown'
    }

    if (!actor || !sameParticipant(actor, participant.actor)) {
      participant.ws.close(CLOSE_ACCESS_WITHDRAWN, 'Access withdrawn.')
      return 'denied'
    }

    // A role may have changed without taking write access away.
    participant.actor = actor
    participant.verifiedAt = Date.now()
    return 'ok'
  }

  participant.checking = participant.checking.then(run, run)
  return participant.checking
}

/** Re-checks every open socket, or only those whose last check has grown old. */
export async function sweep(server: Checking, which: 'all' | 'stale'): Promise<void> {
  const cutoff = Date.now() - server.limits.revalidateMs
  // One at a time: a notification re-checks every socket in the process, and
  // doing that in parallel would take the whole pool from the requests that
  // are writing.
  for (const participant of [...server.participants]) {
    if (which === 'stale' && participant.verifiedAt > cutoff) continue
    await revalidate(participant)
  }
}

/**
 * Before a message is handled: is the last check recent enough to act on?
 *
 * This is what keeps a withdrawn guest out of the record when the notification
 * is late or lost -- the message waits for the answer, and the answer decides.
 * "Could not ask" closes the socket too, but as a failure, so the client
 * reconnects and resyncs: dropping one message and carrying on would leave it
 * believing the server has something it does not.
 */
export async function stillAllowed(server: Checking, participant: Participant): Promise<boolean> {
  if (Date.now() - participant.verifiedAt < server.limits.revalidateMs) return true

  const verdict = await revalidate(participant)
  if (verdict === 'unknown') participant.ws.close(1011, 'Access could not be checked.')
  return verdict === 'ok'
}
