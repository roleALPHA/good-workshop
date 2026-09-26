import type { IncomingMessage } from 'node:http'
import { assertWorkshopAccess } from '@/domain/agenda/access'
import { assertDayInWorkshop } from '@/domain/agenda/repo'
import { DomainError } from '@/domain/errors'
import { authConfig } from '@/server/auth/config'
import { SESSION_COOKIE_NAMES, verifySessionCookie } from '@/server/auth/session'
import { GUEST_COOKIE_NAMES, guestActor, verifyGuestCookie } from '@/server/auth/share-session'
import { withTenant, type Actor } from '@/server/db'
import { hasScope, resolveBearer } from '@/server/mcp/auth'

/**
 * Who is on the socket, and may they be.
 *
 * Authentication is the session cookie the browser already sends on the upgrade
 * request. No ticket endpoint, no second token to mint and expire: the credential
 * that opens the editor is the credential that opens the socket. A personal
 * access token is accepted the same way, because an LLM writing through MCP is a
 * participant here and not a special case.
 *
 * The credential is a value rather than a check that happened, because it is
 * asked again for as long as the socket is open -- see ./ws-revalidate.ts.
 */

/** What the socket was opened with, kept so it can be asked again. */
export type Credential = { authorization?: string; cookie?: string }

export function parseTarget(request: IncomingMessage, path: string) {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (url.pathname !== path) return null

  const workshopId = url.searchParams.get('workshop')
  const dayId = url.searchParams.get('day')
  return workshopId && dayId ? { workshopId, dayId } : null
}

export function credentialOf(request: IncomingMessage): Credential {
  return { authorization: request.headers.authorization, cookie: request.headers.cookie }
}

/**
 * Where the browser says it is.
 *
 * A cross-site handshake already fails today, because the session cookie is
 * SameSite=Lax and a WebSocket upgrade is not a top-level navigation. That is a
 * real defence, but it lives in another file and protects this one by accident;
 * anybody loosening `sameSite` would have no reason to look here.
 *
 * A missing Origin is allowed through: non-browser clients do not send one, and
 * the MCP path is exactly that. Origin is a browser's statement about itself,
 * so its absence carries no claim to reject.
 */
export function sameOrigin(request: IncomingMessage): boolean {
  const origin = request.headers.origin
  if (!origin) return true

  try {
    return new URL(origin).origin === authConfig.origin
  } catch {
    return false
  }
}

/**
 * A session cookie or a personal access token, then the same per-workshop
 * capability check the web app uses -- and then the part that was missing: that
 * the day this socket is about is a day of that workshop.
 *
 * Read access is not enough: a socket that can only read still receives every
 * keystroke, so a viewer gets a connection but their updates are ignored
 * (see `attach`). Write access is checked here so a reader never even opens
 * one under the impression they can edit.
 *
 * The day check belongs here rather than in `Room.load()`, which is where it
 * used to half-live: load() returns early for a day that already has CRDT
 * state, so the check it does run is the one nobody needed -- an unopened day
 * -- while every real workshop took the early return. Checking before the room
 * is opened also covers MCP, whose writes come through this same socket.
 *
 * `null` is a refusal. A throw is "could not ask" -- the database is away --
 * and the callers treat the two differently: a handshake refuses either way,
 * but a socket that is already open is not closed because Postgres blinked.
 *
 * `lock` only at the handshake, where it always was. The re-checks run for
 * every open socket at once, and taking the workshop row lock for each would
 * queue them behind every structural edit and every materialisation.
 */
export async function authorize(
  credential: Credential,
  workshopId: string,
  dayId: string,
  { lock }: { lock: boolean },
): Promise<Actor | null> {
  const actor = await identify(credential)
  if (!actor) return null

  try {
    await withTenant(actor, async (tx) => {
      const access = await assertWorkshopAccess(tx, actor, workshopId, 'workshop.content.write', {
        forUpdate: lock,
      })
      await assertDayInWorkshop(tx, access, dayId)
    })
    return actor
  } catch (error) {
    if (error instanceof DomainError) return null
    throw error
  }
}

export async function identify(credential: Credential): Promise<Actor | null> {
  const header = credential.authorization
  if (header) {
    const pat = await resolveBearer(header)
    // A read-only token opening a write socket is a mistake worth naming
    // early rather than letting it connect and silently drop every update.
    if (!pat || !hasScope(pat, 'workshops:write')) return null
    return {
      tenantId: pat.tenantId,
      memberId: pat.memberId,
      tenantRole: pat.tenantRole,
      source: 'mcp',
    }
  }

  const cookies = parseCookies(credential.cookie ?? '')

  const raw = SESSION_COOKIE_NAMES.map((name) => cookies[name]).find(Boolean)
  if (raw) {
    const session = await verifySessionCookie(raw)
    if (session) {
      return {
        tenantId: session.tenantId,
        memberId: session.memberId,
        tenantRole: session.tenantRole,
        displayName: session.displayName || session.email,
        source: 'web',
      }
    }
    // Deliberately falls through rather than refusing. A session cookie outlives
    // the session it names -- revoked, idle, expired, or left behind by somebody
    // who is no longer a member -- and a stale one must not shadow a perfectly
    // good guest cookie in the same browser. Refusing here would give that guest
    // an editor that renders and never connects, which is the worst of the three
    // possible outcomes.
  }

  /**
   * A share-link guest, third and last.
   *
   * After the member cookie rather than before it, so that a member who opens an
   * invitation to check it stays themselves in the room -- they hold both
   * cookies, and the stronger credential is the one they should act under.
   *
   * Nothing here decides whether the guest may WRITE. `authorize` above
   * already demands workshop.content.write before the upgrade, and for a guest
   * invited to read that check fails on the capability table alone -- so a
   * read-only guest is refused at the handshake without a line of special case
   * anywhere in this file.
   */
  const guestRaw = GUEST_COOKIE_NAMES.map((name) => cookies[name]).find(Boolean)
  if (!guestRaw) return null

  const guest = await verifyGuestCookie(guestRaw)
  return guest ? guestActor(guest) : null
}

/**
 * Whether a re-check still describes the same participant.
 *
 * A credential cannot change hands, but the stale-session fall-through in
 * `identify` means the same Cookie header can resolve to a different actor
 * later -- a member cookie that expired, leaving the guest cookie beside it.
 * That is not the participant who was let in, and the room says who is typing.
 */
export function sameParticipant(now: Actor, then: Actor): boolean {
  return (
    now.tenantId === then.tenantId &&
    (now.memberId ?? null) === (then.memberId ?? null) &&
    (now.share?.linkId ?? null) === (then.share?.linkId ?? null)
  )
}

/**
 * A name for an actor that has none. An MCP token belongs to a person, but the
 * room is showing what is typing, and that is the tool.
 */
export function fallbackName(actor: Actor): string {
  if (actor.source === 'mcp') return 'KI-Assistent'
  // A guest always has one -- guestActor puts the invited address in
  // displayName -- so this is the belt to that braces rather than the normal
  // path. It says "guest" because somebody in the room seeing an unnamed
  // participant should know it is an external one.
  if (actor.source === 'guest') return 'Gast'
  return 'Mitglied'
}

export function parseCookies(header: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim())
  }
  return out
}

export function reject(
  socket: { write: (data: string) => void; destroy: () => void },
  status: number,
  reason: string,
) {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`)
  socket.destroy()
}
