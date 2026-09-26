import type * as Y from 'yjs'
import * as encoding from 'lib0/encoding'
import * as syncProtocol from 'y-protocols/sync'

/**
 * The wire between a browser and the collaboration server.
 *
 * Three message types on one socket, each a length-prefixed frame: the Yjs sync
 * protocol, awareness, and one of our own for the things the room has to say in
 * words -- "your access was withdrawn", "this document is too large".
 *
 * Encoding lives apart from the server because it is the half that has to stay
 * identical on both ends. The browser side is src/features/collab/, and a frame
 * written differently here is a frame nobody can read there.
 */

export const MAX_FRAME_BYTES = 1024 * 1024

export const MESSAGE_SYNC = 0
export const MESSAGE_AWARENESS = 1
/**
 * Out-of-band requests that are not part of the Yjs protocol.
 *
 * Exactly one so far: "write the tables out now". A human editor never needs
 * it -- they read the document, not the tables -- but a tool call has to be
 * able to answer "is it saved" with something better than a debounce timer.
 */
export const MESSAGE_CONTROL = 2

export function controlMessage(payload: Record<string, unknown>): Uint8Array {
  return message(MESSAGE_CONTROL, new TextEncoder().encode(JSON.stringify(payload)))
}

export function encodeSyncStep1(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  syncProtocol.writeSyncStep1(encoder, doc)
  return encoding.toUint8Array(encoder)
}

export function encodeSyncUpdate(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  syncProtocol.writeUpdate(encoder, update)
  return encoding.toUint8Array(encoder)
}

export function message(type: number, payload: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, type)
  encoding.writeVarUint8Array(encoder, payload)
  return encoding.toUint8Array(encoder)
}
