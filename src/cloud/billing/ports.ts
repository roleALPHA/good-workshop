import type { PlanKey } from '@/cloud/billing/plans'
import type { InvoiceLocale } from '@/cloud/billing/usage'
import type { TaxTreatment } from '@/cloud/tax/treatment'

/**
 * What billing needs from the outside world, and nothing about how.
 *
 * Accounting (Odoo) issues and sends invoices and books payments; payments
 * (Stripe) keeps a payment method and collects. The implementations live in the
 * private repository; this repository has the contract, a fake for tests
 * (./adapters/fake.ts) and an implementation that refuses everything
 * (./adapters/unavailable.ts), which is what a build without the private
 * adapters gets -- so it cannot bill by accident.
 */

export type BillingCustomer = {
  tenantId: string
  customerRef: string | null
  customerType: 'business'
  name: string
  email: string
  street: string
  postalCode: string
  city: string
  country: string
  vatId: string | null
  /** The language their documents are written in, so the accounting system renders them in it. */
  locale: InvoiceLocale
}

export type InvoiceLine = {
  description: string
  quantity: number
  unitNetCents: number
  /**
   * Which plan the line bills. The accounting adapter picks its article from
   * this, never from the description -- a reworded line must not change what
   * gets invoiced.
   */
  plan: PlanKey
}

export type IssuedInvoice = {
  id: string
  number: string
  netCents: number
  taxCents: number
  grossCents: number
  url: string | null
}

export type InvoicingPort = {
  /**
   * What the article for a plan costs there, net, in cents.
   *
   * The accounting system owns the price: it has to carry it for the invoice
   * anyway, and a second copy in the code is the copy that goes stale.
   */
  planPrice(plan: PlanKey): Promise<number>
  /** Creates or updates the customer; returns the accounting system's id for it. */
  upsertCustomer(customer: BillingCustomer): Promise<string>
  /** The invoice already issued under this reference, if any -- what makes a repeated run safe. */
  findInvoice(ref: string): Promise<IssuedInvoice | null>
  /** Creates, posts and sends the invoice. The accounting system computes the tax. */
  issueInvoice(input: {
    customerRef: string
    ref: string
    lines: InvoiceLine[]
    tax: Exclude<TaxTreatment, { kind: 'hold' }>
    /** Stated on the invoice: the amount will be collected (SEPA pre-notification). */
    collectedAfter: Date
    /**
     * The language the invoice is written in: the one the customer registered
     * in, reduced to the two the accounting system renders.
     */
    locale: InvoiceLocale
  }): Promise<IssuedInvoice>
  /**
   * The invoice as it was sent, for the customer to download later. Null when
   * the accounting system has no document for it (yet).
   */
  invoiceDocument(invoiceId: string): Promise<{ filename: string; bytes: Uint8Array } | null>
  recordPayment(input: {
    invoiceId: string
    amountCents: number
    paidAt: Date
    paymentRef: string
  }): Promise<void>
}

export type PaymentEvent =
  | { id: string; type: 'payment_succeeded'; paymentRef: string; amountCents: number }
  | { id: string; type: 'payment_failed'; paymentRef: string; reason: string }
  | {
      id: string
      type: 'payment_method_ready'
      tenantId: string
      customerRef: string
      /** Country of the card or bank account, kept as evidence alongside the billing address. */
      country: string | null
    }
  | { id: string; type: 'ignored' }

export type PaymentPort = {
  /** A hosted page where the customer enters a payment method; card data never touches us. */
  createSetupSession(input: {
    tenantId: string
    customerRef: string | null
    email: string
    returnUrl: string
  }): Promise<{ url: string; customerRef: string }>
  charge(input: {
    customerRef: string
    amountCents: number
    idempotencyKey: string
    description: string
  }): Promise<{
    paymentRef: string
    status: 'succeeded' | 'processing' | 'failed'
    reason?: string
  }>
  /** Null for anything whose signature does not verify. */
  parseWebhook(body: string, signature: string | null): PaymentEvent | null
}

export type BillingAdapters = { invoicing: InvoicingPort; payments: PaymentPort }

export class BillingUnavailableError extends Error {
  constructor() {
    super(
      'No billing adapters in this build. The accounting and payment adapters come from the ' +
        'private cloud build; a public build cannot issue invoices or collect payments.',
    )
    this.name = 'BillingUnavailableError'
  }
}
