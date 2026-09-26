import { DELETION_GRACE_DAYS } from './plans'
import type { VatCheck } from '@/cloud/tax/vies'
import { viennaDay } from './usage'
import { announce, localeOf, DAY, type Db, type RunOptions } from './context'

/**
 * A workspace's way through time: the trial, the contract, a VAT number VIES
 * could not answer for, and finally deletion.
 *
 * All of it is date arithmetic against the run's injected `now`, and all of it is
 * repeatable: each step names the state it expects. The reminders before a trial
 * ends are remembered by the key they were sent under, so a run that goes twice
 * in one day does not write twice.
 */

const REMINDERS = [
  { key: 'trial_4d', days: 4 },
  { key: 'trial_1d', days: 1 },
] as const

/**
 * Contracts that ran out at the end of last month (AGB § 6.2).
 *
 * The notice period is over, so the workspace becomes what a workspace becomes
 * when its customer leaves: read-only, exportable, and deleted after the grace
 * period. That is the deletion path, reused deliberately -- one way from "no
 * longer a customer" to "data gone", with the export window in it, and a purge
 * that waits for the last month to be invoiced.
 */
export async function contractTransitions(db: Db, options: RunOptions) {
  const today = viennaDay(options.now)
  const { rows } = await db.query(
    `select l.tenant_id, b.billing_email, b.locale
       from tenant_lifecycle l join billing_account b on b.tenant_id = l.tenant_id
      where l.contract_ends_on is not null and l.contract_ends_on < $1::date
        and l.state <> 'deleting'`,
    [today],
  )

  for (const tenant of rows) {
    const { rows: scheduled } = await db.query(
      `select app.cloud_schedule_tenant_deletion($1, $2) as delete_after`,
      [tenant.tenant_id, DELETION_GRACE_DAYS],
    )
    const until = scheduled[0]?.delete_after
    if (!until) continue
    await announce(options, {
      kind: 'contract_ended',
      to: tenant.billing_email,
      locale: localeOf(tenant.locale),
      exportUntil: until,
    })
  }
}

export async function trialTransitions(db: Db, options: RunOptions) {
  const { rows } = await db.query(
    `select l.tenant_id, l.trial_ends_at, b.payment_method_ready, b.billing_email, b.locale,
            b.reminders_sent
       from tenant_lifecycle l join billing_account b on b.tenant_id = l.tenant_id
      where l.state = 'trial' and l.trial_ends_at is not null`,
  )

  for (const tenant of rows) {
    const left = tenant.trial_ends_at.getTime() - options.now.getTime()

    if (left <= 0) {
      const next = tenant.payment_method_ready ? 'active' : 'read_only'
      const moved = await db.query(
        `update tenant_lifecycle set state = $2, updated_at = now()
          where tenant_id = $1 and state = 'trial' returning tenant_id`,
        [tenant.tenant_id, next],
      )
      if (moved.rowCount && next === 'read_only') {
        await announce(options, {
          kind: 'read_only',
          to: tenant.billing_email,
          locale: localeOf(tenant.locale),
          reason: 'trial_ended',
        })
      }
      continue
    }

    if (tenant.payment_method_ready) continue
    for (const reminder of REMINDERS) {
      if (left > reminder.days * DAY || tenant.reminders_sent.includes(reminder.key)) continue
      const marked = await db.query(
        `update billing_account set reminders_sent = array_append(reminders_sent, $2)
          where tenant_id = $1 and not ($2 = any(reminders_sent)) returning tenant_id`,
        [tenant.tenant_id, reminder.key],
      )
      if (marked.rowCount) {
        await announce(options, {
          kind: 'trial_ending',
          to: tenant.billing_email,
          locale: localeOf(tenant.locale),
          daysLeft: Math.max(1, Math.ceil(left / DAY)),
        })
      }
      break
    }
  }
}

export async function recheckPendingVat(
  db: Db,
  check: (vatId: string) => Promise<VatCheck>,
  options: RunOptions,
) {
  const { rows } = await db.query(
    `select tenant_id, vat_id from billing_account where vat_status = 'pending' and vat_id is not null`,
  )
  for (const account of rows) {
    const result = await check(account.vat_id)
    await db.query(
      `insert into vat_check (tenant_id, vat_id, result, name, address, consultation_number, error, checked_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        account.tenant_id,
        account.vat_id,
        result.status,
        'name' in result ? result.name : null,
        'address' in result ? result.address : null,
        'consultationNumber' in result ? result.consultationNumber : null,
        'error' in result ? result.error : null,
        result.checkedAt,
      ],
    )
    if (result.status !== 'unavailable') {
      await db.query(
        `update billing_account set vat_status = $2, updated_at = now() where tenant_id = $1`,
        [account.tenant_id, result.status],
      )
      // A period held only because the number was pending can be billed now.
      await db.query(
        `delete from billing_period where tenant_id = $1 and status = 'held' and hold_reason = 'vat_pending'`,
        [account.tenant_id],
      )
    }
  }
  if (rows.length) options.log('billing: VAT numbers rechecked', { count: rows.length })
}

/**
 * Deletes a workspace for good: its content, its members, and every account
 * that belonged to no other workspace. The bookkeeping stays -- billing_account,
 * billing_period, vat_check and the usage tables have no foreign key to tenant
 * on purpose.
 *
 * Waits until the month the deletion was asked for has been closed, so that the
 * last, partial month is invoiced like every other one.
 */
export async function purgeDeletedTenants(db: Db, options: RunOptions) {
  const { rows } = await db.query(
    `select l.tenant_id, l.deletion_requested_at
       from tenant_lifecycle l
      where l.state = 'deleting' and l.delete_after <= $1`,
    [options.now],
  )

  for (const tenant of rows) {
    const requestedMonth = `${viennaDay(tenant.deletion_requested_at).slice(0, 7)}-01`
    const closed = await db.query(
      `select 1 from billing_period where tenant_id = $1 and month = $2`,
      [tenant.tenant_id, requestedMonth],
    )
    const stillInTrial = await db.query(
      `select 1 from tenant_lifecycle
        where tenant_id = $1 and (trial_ends_at is null or trial_ends_at > deletion_requested_at)`,
      [tenant.tenant_id],
    )
    if (!closed.rowCount && !stillInTrial.rowCount) continue

    const { rows: identities } = await db.query(
      `select identity_id from member where tenant_id = $1`,
      [tenant.tenant_id],
    )
    await db.query('begin')
    try {
      // Revisions carry no foreign key (see the schema); everything else goes
      // with the tenant row by cascade.
      await db.query(`delete from module_revision where tenant_id = $1`, [tenant.tenant_id])
      await db.query(`delete from tenant where id = $1`, [tenant.tenant_id])
      await db.query(
        `delete from identity i
          where i.id = any($1::uuid[])
            and not exists (select 1 from member m where m.identity_id = i.id)`,
        [identities.map((row) => row.identity_id)],
      )
      await db.query('commit')
    } catch (error) {
      await db.query('rollback')
      throw error
    }
    options.log('billing: workspace deleted', { tenantId: tenant.tenant_id })
  }
}
