import pg from 'pg'
import { adapters, configured } from '@gw/billing-adapters'
// The same connection options the migration scripts use, including the
// password file a container mounts instead of a password in the URL.
import { dbOptions } from '../../../scripts/db-connect.mjs'
import { checkVatId } from '@/cloud/tax/vies'
import { runBilling } from './run'
import type { RunOptions } from './context'
import { sendNotice } from './notices'

/**
 * The billing worker: one process, one run every few minutes, one run at a time
 * across every replica.
 *
 * Runs as the operations role (OPS_DATABASE_URL): billing reads and writes across
 * tenants by nature. The web container never gets that role; the worker never
 * serves a request.
 *
 * Fail-closed in three ways. Without real adapters it only closes months and
 * moves trials, and says so. GW_BILLING_MODE is `dry_run` unless it is exactly
 * `live`. And an advisory lock means a second worker waits instead of billing in
 * parallel.
 */

const INTERVAL_MS = Number(process.env.GW_BILLING_INTERVAL_MS ?? 10 * 60_000)
const LOCK = 'gw_billing'

const url = process.env.OPS_DATABASE_URL
if (!url) {
  console.error('billing worker: OPS_DATABASE_URL is required.')
  process.exit(1)
}

const pool = new pg.Pool(dbOptions(url, process.env.OPS_DATABASE_PASSWORD_FILE))
const mode: RunOptions['mode'] = process.env.GW_BILLING_MODE === 'live' ? 'live' : 'dry_run'

const log = (message: string, data: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), message, ...data }))

async function once() {
  const client = await pool.connect()
  try {
    const { rows } = await client.query('select pg_try_advisory_lock(hashtext($1)) as locked', [
      LOCK,
    ])
    if (!rows[0].locked) {
      log('billing: another worker holds the lock')
      return
    }
    try {
      await runBilling(client, configured ? adapters : null, (vatId) => checkVatId(vatId), {
        now: new Date(),
        mode,
        maxInvoiceCents: Number(process.env.GW_BILLING_MAX_INVOICE_CENTS ?? 100_000),
        collectAfterDays: 2,
        notify: (notice) => sendNotice(notice, notice.locale),
        log,
      })
    } finally {
      await client.query('select pg_advisory_unlock(hashtext($1))', [LOCK])
    }
  } catch (error) {
    log('billing: run failed', { error: String(error instanceof Error ? error.stack : error) })
  } finally {
    client.release()
  }
}

log('billing worker started', { mode, adapters: configured, intervalMs: INTERVAL_MS })
if (!configured) log('billing: no adapters in this build -- invoicing and payments are off')

let timer: NodeJS.Timeout
const loop = async () => {
  await once()
  timer = setTimeout(() => void loop(), INTERVAL_MS)
}
void loop()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    clearTimeout(timer)
    void pool.end().finally(() => process.exit(0))
  })
}
