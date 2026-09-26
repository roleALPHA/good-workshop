import type { BillingAdapters, IssuedInvoice } from './ports'
import { PLANS, type PlanKey } from './plans'
import { invoiceLine, invoiceLocaleOf } from './usage'
import { DAY, type Db, type RunOptions } from './context'

/**
 * Turning a closed period into an invoice, and keeping the document.
 *
 * The invoice reference is the idempotency key towards the outside world: a
 * repeated run finds the invoice it already issued rather than issuing a second
 * one. What accounting hands back is checked against what was computed before it
 * is believed -- see `implausible` -- because an invoice that does not match the
 * period is a question for a person, not a number to record.
 */

export async function invoicePeriods(db: Db, adapters: BillingAdapters, options: RunOptions) {
  const { rows } = await db.query(
    `select p.*, b.customer_type, b.company_name, b.street, b.postal_code, b.city, b.country,
            b.vat_id, b.billing_email, b.invoicing_customer_ref, b.locale, t.name as tenant_name
       from billing_period p
       join billing_account b on b.tenant_id = p.tenant_id
       left join tenant t on t.id = p.tenant_id
      where p.status = 'computed'
      order by p.month, p.created_at`,
  )

  for (const period of rows) {
    if (options.mode === 'dry_run') {
      options.log('billing: would invoice', { ref: period.invoice_ref, netCents: period.net_cents })
      continue
    }
    const locale = invoiceLocaleOf(period.locale)
    try {
      const customerRef = await adapters.invoicing.upsertCustomer({
        tenantId: period.tenant_id,
        customerRef: period.invoicing_customer_ref,
        customerType: period.customer_type,
        name: period.company_name ?? period.tenant_name ?? period.billing_email,
        email: period.billing_email,
        street: period.street,
        postalCode: period.postal_code,
        city: period.city,
        country: period.country,
        vatId: period.vat_id,
        locale,
      })
      await db.query(
        `update billing_account set invoicing_customer_ref = $2, updated_at = now() where tenant_id = $1`,
        [period.tenant_id, customerRef],
      )

      const collectedAfter = new Date(options.now.getTime() + options.collectAfterDays * DAY)
      const invoice =
        (await adapters.invoicing.findInvoice(period.invoice_ref)) ??
        (await adapters.invoicing.issueInvoice({
          customerRef,
          ref: period.invoice_ref,
          lines: [
            {
              description: invoiceLine(PLANS[period.plan as PlanKey].unit, period.month, locale),
              quantity: Number(period.quantity),
              unitNetCents: period.unit_net_cents,
              plan: period.plan,
            },
          ],
          tax: {
            kind: period.tax_kind,
            country: period.tax_country,
            rate: period.tax_rate === null ? undefined : Number(period.tax_rate),
          } as never,
          collectedAfter,
          locale,
        }))

      const problem = implausible(period, invoice)
      if (problem) {
        await db.query(
          `update billing_period set status = 'held', hold_reason = 'invoice_mismatch', last_error = $2,
                  invoice_id = $3, invoice_number = $4, updated_at = now()
            where id = $1 and status = 'computed'`,
          [period.id, problem, invoice.id, invoice.number],
        )
        options.log('billing: invoice held', { ref: period.invoice_ref, problem })
        continue
      }

      await db.query(
        `update billing_period
            set status = 'invoiced', invoice_id = $2, invoice_number = $3, invoice_url = $4,
                gross_cents = $5, invoiced_at = $6, charge_after = $7, updated_at = now()
          where id = $1 and status = 'computed'`,
        [
          period.id,
          invoice.id,
          invoice.number,
          invoice.url,
          invoice.grossCents,
          options.now,
          collectedAfter,
        ],
      )
    } catch (error) {
      await db.query(
        `update billing_period set last_error = $2, updated_at = now() where id = $1`,
        [period.id, String(error instanceof Error ? error.message : error)],
      )
      options.log('billing: invoicing failed, will retry', { ref: period.invoice_ref })
    }
  }
}

/** What the accounting system returned, checked against what was billed. */
export function implausible(
  period: { net_cents: number; tax_kind: string; tax_rate: string | number | null },
  invoice: IssuedInvoice,
): string | null {
  if (invoice.netCents !== period.net_cents) {
    return `net ${invoice.netCents} instead of ${period.net_cents}`
  }
  const rate = period.tax_kind === 'domestic' ? Number(period.tax_rate) : 0
  const expected = Math.round(period.net_cents * rate)
  if (Math.abs(invoice.taxCents - expected) > 1)
    return `tax ${invoice.taxCents} instead of ${expected}`
  if (invoice.grossCents !== invoice.netCents + invoice.taxCents) return 'gross is not net plus tax'
  return null
}

/**
 * Fetches the invoice as it was sent and keeps it, so a customer can download
 * its own later without an account in the accounting system.
 *
 * Separate from invoicing on purpose: an invoice that is issued and sent but
 * whose PDF could not be fetched is not a failed invoice. The next run picks it
 * up.
 */
export async function storeInvoiceDocuments(
  db: Db,
  adapters: BillingAdapters,
  options: RunOptions,
): Promise<number> {
  if (options.mode === 'dry_run') return 0

  const { rows } = await db.query(
    `select p.tenant_id, p.month, p.invoice_id, p.invoice_number
       from billing_period p
       left join invoice_document d on d.tenant_id = p.tenant_id and d.month = p.month
      where p.invoice_id is not null and d.tenant_id is null
      order by p.month
      limit 50`,
  )

  let stored = 0
  for (const period of rows) {
    try {
      const document = await adapters.invoicing.invoiceDocument(period.invoice_id)
      if (!document) continue
      await db.query(
        `insert into invoice_document (tenant_id, month, filename, content, byte_size)
         values ($1, $2, $3, $4, $5)
         on conflict (tenant_id, month) do nothing`,
        [
          period.tenant_id,
          period.month,
          document.filename,
          Buffer.from(document.bytes),
          document.bytes.byteLength,
        ],
      )
      stored += 1
    } catch (error) {
      options.log('billing: could not fetch the invoice document', {
        invoice: period.invoice_number,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return stored
}
