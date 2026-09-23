import type pg from 'pg'
import type { OperatorAction } from './console'

/**
 * The pause before something destructive.
 *
 * The first call describes what would happen and returns a handle; the second
 * takes the handle and the digits it was shown, and NOTHING ELSE. What happens
 * is read back out of the staged row -- so a confirmation cannot perform a
 * different action, by construction rather than by checking.
 *
 * The digits are the belt beside that: they force the caller to echo back the
 * identity it was shown, so a handle picked up from an earlier proposal fails
 * loudly instead of quietly firing the wrong thing.
 */

type Db = Pick<pg.Pool, 'query'>

/** The actions that may not happen on one call. */
export const CONFIRMED_KINDS = [
  'block',
  'schedule_deletion',
  'announce_terms',
  // Writing off an invoice is destructive in the way that matters here: the
  // money is gone and the period cannot be billed again.
  'release_period_void',
] as const

export type ConfirmedKind = (typeof CONFIRMED_KINDS)[number]

export type Staged = { id: string; digest: string; expiresAt: Date }

export async function stageAction(
  db: Db,
  operatorId: string,
  kind: ConfirmedKind,
  tenantId: string | null,
  args: Record<string, unknown>,
): Promise<Staged> {
  const { rows } = await db.query('select * from app.op_stage($1,$2,$3,$4)', [
    operatorId,
    kind,
    tenantId,
    JSON.stringify(args),
  ])
  return { id: rows[0].id, digest: rows[0].digest, expiresAt: rows[0].expires_at }
}

/**
 * Spends a handle and hands back what was staged, or nothing.
 *
 * Nothing covers every way this can fail -- wrong digits, another operator's
 * handle, already used, expired -- and deliberately does not say which. The
 * answer to a bad confirmation is "there is nothing to confirm", not a hint
 * about what would have worked.
 */
export async function takeAction(
  db: Db,
  operatorId: string,
  handle: string,
  digest: string,
): Promise<{ kind: string; tenantId: string | null; args: Record<string, unknown> } | null> {
  const { rows } = await db.query('select * from app.op_take($1,$2,$3)', [
    operatorId,
    handle,
    digest,
  ])
  const row = rows[0]
  return row ? { kind: row.kind, tenantId: row.tenant_id, args: row.args } : null
}

/** Turns a staged row back into the union the console already validates. */
export function actionFrom(kind: string, args: Record<string, unknown>): OperatorAction | null {
  switch (kind) {
    case 'block':
      return { kind: 'block', reason: String(args['reason'] ?? '') }
    case 'schedule_deletion':
      return {
        kind: 'schedule_deletion',
        days: Number(args['days'] ?? 0),
        reason: String(args['reason'] ?? ''),
      }
    case 'announce_terms':
      return {
        kind: 'announce_terms',
        document: String(args['document'] ?? ''),
        version: String(args['version'] ?? ''),
        effectiveFrom: String(args['effectiveFrom'] ?? ''),
      }
    case 'release_period_void':
      return {
        kind: 'release_period',
        periodId: String(args['periodId'] ?? ''),
        decision: 'void',
      }
    default:
      return null
  }
}
