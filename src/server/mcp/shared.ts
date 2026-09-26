import { z } from 'zod'
import type { Tx } from '@/server/db'
import { auditEvent } from '@/server/db/schema'
import type { PatActor } from './auth'

/**
 * What every tool surface needs, and none of them should spell out twice.
 *
 * Small on purpose: the shapes below are the ones that would otherwise drift
 * apart between the library, a day's content and the catalogue -- a `Version`
 * that accepts a number in one place and a string in another is a difference a
 * model has no way to discover.
 */

/**
 * The raw Authorization header travels with the context.
 *
 * Writes open a socket to the collaboration room, and the room authenticates
 * the same credential the tool call arrived with -- rather than the MCP server
 * holding some second, more powerful key. There is still no privileged path.
 */
export type Ctx = { actor: PatActor; authorization: string }

/**
 * MCP answers in English, always.
 *
 * The audience is a model, and the text is prompt material it decides its next
 * call from. See the note in ./errors.ts; `get_workshop` takes an explicit
 * locale for the Markdown a human will actually read.
 */
export const MCP_LOCALE = 'en' as const

export const Id = z.string().uuid()

export const Version = z
  .string()
  .regex(/^\d+$/)
  .optional()
  .describe('The contentVersion you last read. A stale one is refused instead of overwriting.')

export const asVersion = (value?: string) => (value === undefined ? undefined : BigInt(value))

/**
 * An audit row for every mutation, written in the same transaction as the
 * change it describes. Non-negotiable for a surface that lets a model write to
 * somebody's data.
 */
export function auditor(actor: PatActor, entityType: 'workshop' | 'folder') {
  return (tx: Tx, action: string, entityId: string | null, data: Record<string, unknown> = {}) =>
    tx.insert(auditEvent).values({
      actorMemberId: actor.memberId,
      source: 'mcp',
      tokenId: actor.patId,
      entityType,
      entityId,
      action,
      data,
    })
}
