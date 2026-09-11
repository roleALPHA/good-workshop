/**
 * Who the room says you are.
 *
 * `LocalPresence` in the collaboration provider carries a comment stating the
 * goal outright: "an LLM joins this room too and must not be able to pass for a
 * colleague". Nothing enforced it. The awareness state arrived from the client
 * and was broadcast to every peer unread, while the server had known the real
 * actor since the handshake.
 *
 * This is not a data leak, and it is worse in one narrow way. The presence
 * strip is read as testimony -- "Anna is editing this block" -- and it is the
 * one part of the interface a reader has no way to check. A model presenting
 * itself as Anna, or one colleague presenting themselves as another, makes that
 * testimony false.
 *
 * Only what the server actually knows is overruled. The hue is a preference the
 * server has no opinion about, and taking it away as well would be enforcement
 * for its own sake.
 */
export type PresenceClaim = { name: string; hue: number; kind: 'person' | 'model' }

export type PresenceActor = { displayName: string; source: 'web' | 'mcp' | 'api' | 'system' }

export function authoritativePresence(
  claimed: Partial<PresenceClaim> | undefined,
  actor: PresenceActor,
): PresenceClaim {
  return {
    name: actor.displayName,
    // `kind` follows the connection, not the claim. An MCP client is a model
    // however politely it introduces itself, and a browser client cannot
    // volunteer to be labelled one either -- being mistaken for a machine is
    // its own kind of false testimony.
    kind: actor.source === 'mcp' ? 'model' : 'person',
    hue: typeof claimed?.hue === 'number' && Number.isFinite(claimed.hue) ? claimed.hue : 0,
  }
}
