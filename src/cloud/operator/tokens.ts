import type pg from 'pg'
import { generateOperatorToken, hashSecret, parseOperatorToken } from '@/server/auth/tokens'
import { isOperatorScope, type OperatorScope } from './scopes'

/**
 * The bearer credential an operator uses through a model.
 *
 * Every call is one `app.op_*` function, because gw_operator has no table
 * grant and this file does not change that. The checks are in the database as
 * well as here -- an argument is only as good as the caller that built it, and
 * the function is the last line.
 */

type Db = Pick<pg.Pool, 'query'>

export type OperatorTokenRow = {
  id: string
  name: string
  scopes: string[]
  createdAt: Date
  expiresAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}

export type OperatorActor = {
  operatorId: string
  displayName: string
  scopes: OperatorScope[]
}

/** The longest an operator token may live. Ninety days, checked here and in SQL. */
export const MAX_TOKEN_DAYS = 90

export async function issueOperatorToken(
  db: Db,
  operatorId: string,
  input: { name: string; scopes: OperatorScope[]; days: number },
): Promise<{ id: string; token: string }> {
  // Generated here and never stored: the row keeps the key and a hash, and the
  // secret is shown once. The same arrangement as a personal access token.
  const { token, tokenKey, tokenHash } = generateOperatorToken()
  const { rows } = await db.query('select app.op_issue_token($1,$2,$3,$4,$5,$6) as id', [
    operatorId,
    input.name,
    tokenKey,
    tokenHash,
    input.scopes,
    Math.min(Math.max(Math.trunc(input.days), 1), MAX_TOKEN_DAYS),
  ])
  return { id: rows[0].id, token }
}

export async function listOperatorTokens(db: Db, operatorId: string): Promise<OperatorTokenRow[]> {
  const { rows } = await db.query('select * from app.op_tokens($1)', [operatorId])
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    scopes: row.scopes,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  }))
}

export async function revokeOperatorToken(db: Db, operatorId: string, id: string): Promise<void> {
  // Bound to the operator in SQL too: one operator's token is not another's to
  // revoke, and this call is reachable from a form.
  await db.query('select app.op_revoke_token($1, $2)', [operatorId, id])
}

/**
 * Who is behind an Authorization header, or nothing.
 *
 * Refuses by SHAPE first. A customer's `gwp_` or `gwo_` token presented here
 * never reaches a lookup -- which matters because this endpoint can reach
 * every tenant, and "no such token" and "not that kind of token" should not
 * take the same path.
 */
export async function resolveOperatorBearer(
  db: Db,
  header: string | null,
): Promise<OperatorActor | null> {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '')
  if (!match) return null

  const parsed = parseOperatorToken(match[1]!)
  if (!parsed) return null

  const { rows } = await db.query('select * from app.op_resolve_token($1, $2)', [
    parsed.tokenKey,
    hashSecret(parsed.secret),
  ])
  const row = rows[0]
  if (!row) return null

  return {
    operatorId: row.operator_id,
    displayName: row.display_name,
    // Filtered rather than cast: the column is text[] and a scope removed from
    // the vocabulary must stop granting anything, not linger on old rows.
    scopes: (row.scopes as string[]).filter(isOperatorScope),
  }
}
