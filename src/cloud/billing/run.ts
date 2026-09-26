import type { BillingAdapters } from './ports'
import type { VatCheck } from '@/cloud/tax/vies'
import { previousMonth } from './usage'
import type { Db, RunOptions } from './context'
import { syncPlanPrices } from './plan-prices'
import { pendingAnnouncements } from './announcements'
import { sweepExpired } from './retention'
import { closeMonth } from './periods'
import { invoicePeriods, storeInvoiceDocuments } from './invoicing'
import { chargeDue, dunningTransitions, processPaymentEvents } from './collecting'
import {
  contractTransitions,
  purgeDeletedTenants,
  recheckPendingVat,
  trialTransitions,
} from './lifecycle'

/**
 * The billing run: from recorded usage to a paid invoice, in steps that can each
 * be repeated.
 *
 * Every step reads what state a period is in and moves it one state further with
 * an update that names the state it expects, so two workers -- or one worker
 * restarted halfway -- cannot bill a month twice. Towards the outside world the
 * invoice reference is the idempotency key: a repeated run finds the invoice it
 * already issued and the charge it already made.
 *
 * Runs as the operations role, across tenants, in the billing worker only.
 *
 * THE ORDER IS THE DESIGN. This file is short on purpose: what each step does is
 * its own module's business, and what belongs here is which one goes first and
 * why -- the comments below are the only place that reasoning exists.
 */
export async function runBilling(
  db: Db,
  adapters: BillingAdapters | null,
  check: (vatId: string) => Promise<VatCheck>,
  options: RunOptions,
) {
  await recheckPendingVat(db, check, options)
  await trialTransitions(db, options)
  await contractTransitions(db, options)
  await dunningTransitions(db, options)
  await pendingAnnouncements(db, options)
  // Before closing a month: that month is billed at a price this step may have
  // recorded, and the freshness of the answer decides whether we still sell.
  if (adapters) await syncPlanPrices(db, adapters, options)
  await closeMonth(db, previousMonth(options.now), options)
  await purgeDeletedTenants(db, options)
  await sweepExpired(db, options)
  if (!adapters) {
    options.log('billing: no adapters in this build, invoicing and payments are off')
    return
  }
  await processPaymentEvents(db, adapters, options)
  await invoicePeriods(db, adapters, options)
  await storeInvoiceDocuments(db, adapters, options)
  await chargeDue(db, adapters, options)
}
