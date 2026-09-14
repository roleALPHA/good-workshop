/**
 * What one participant may cost the collaboration server.
 *
 * The frame limit in ws.ts bounds a single message and nothing else: a
 * participant who is allowed in -- a guest invited to write is enough -- could
 * send small frames without pause, grow a day's document until memory and the
 * `collab_update` table give out, or simply stop reading while everybody else
 * types into their send buffer. None of that breaks the protocol, so the
 * protocol cannot be what stops it.
 *
 * Every number is generous for a person and for a model writing a whole agenda
 * in one call, and is still a ceiling. Configurable so a test can reach the
 * ceiling in milliseconds, not so an operator has another knob.
 */
export type CollabLimits = {
  /**
   * How old a permission check may be before the next message from that socket
   * waits for a fresh one -- and how often every open socket is checked again.
   * `0` checks before every message and never on a timer.
   */
  revalidateMs: number
  /** A day's whole document, encoded. Tombstones count: churn is growth too. */
  maxDocBytes: number
  /** Messages a socket may send at once, and how fast that allowance returns. */
  messageBurst: number
  messagesPerSecond: number
  /** The same, in bytes. */
  byteBurst: number
  bytesPerSecond: number
  /** Messages received and not yet handled, per socket. */
  maxQueuedMessages: number
  /** Bytes waiting to go out to one socket that is not reading them. */
  maxBufferedBytes: number
  maxConnectionsPerRoom: number
}

const MiB = 1024 * 1024

export const DEFAULT_LIMITS: CollabLimits = {
  // Withdrawal normally arrives as a notification from Postgres, within
  // milliseconds. This is the bound when it does not.
  revalidateMs: 10_000,
  // A full workshop day with long descriptions is a few hundred kilobytes.
  maxDocBytes: 8 * MiB,
  // Typing and moving focus is a few messages a second; a reconnect after an
  // hour offline is one large one.
  messageBurst: 300,
  messagesPerSecond: 60,
  byteBurst: 4 * MiB,
  bytesPerSecond: 512 * 1024,
  maxQueuedMessages: 256,
  maxBufferedBytes: 16 * MiB,
  maxConnectionsPerRoom: 50,
}

/**
 * Close codes, in the application range (4000-4999) so a client can tell them
 * apart from a network failure. Modelled on the HTTP status that says the same.
 */
export const CLOSE_ACCESS_WITHDRAWN = 4401
export const CLOSE_DOCUMENT_TOO_LARGE = 4413
export const CLOSE_TOO_MANY_MESSAGES = 4429
/** RFC 6455 "try again later": the socket stopped reading, or the room was full. */
export const CLOSE_TRY_AGAIN_LATER = 1013

/**
 * A token bucket: `capacity` at once, refilled continuously at `perSecond`.
 *
 * Continuous rather than per fixed window, because a window lets twice the
 * allowance through across its boundary -- and a clock that can be injected,
 * because a limiter tested by sleeping is a limiter not tested.
 */
export class TokenBucket {
  private tokens: number
  private last: number

  constructor(
    private readonly capacity: number,
    private readonly perSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity
    this.last = now()
  }

  /** Takes `amount` if it is there. A refusal takes nothing. */
  take(amount: number): boolean {
    const now = this.now()
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) * this.perSecond) / 1000)
    this.last = now

    if (amount > this.tokens) return false
    this.tokens -= amount
    return true
  }
}
