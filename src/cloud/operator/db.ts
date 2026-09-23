import pg from 'pg'
import { dbOptions } from '../../../scripts/db-connect.mjs'
import { operatorConsoleEnabled } from '@/server/operator/enabled'

/**
 * The operator console's own connection, as gw_operator.
 *
 * Not the application's pool: that one is gw_app and must never be able to
 * call an app.op_* function, and this one must never be able to read a tenant
 * table. Only a process started with GW_OPERATOR_CONSOLE=1 and
 * OPERATOR_DATABASE_URL has it at all.
 */
let pool: pg.Pool | null = null

// Defined in src/server/operator/enabled.ts and re-exported here, because the
// two OAuth discovery documents are plain routes that must not import from
// src/cloud. One definition; see that file for why.
export { operatorConsoleEnabled }

export function operatorDb(): pg.Pool {
  if (!operatorConsoleEnabled()) {
    throw new Error('The operator console is not enabled in this process.')
  }
  pool ??= new pg.Pool({
    ...dbOptions(process.env.OPERATOR_DATABASE_URL!, process.env.OPERATOR_DATABASE_PASSWORD_FILE),
    max: 4,
  })
  return pool
}
