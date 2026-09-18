import type { BillingAdapters, IssuedInvoice, PaymentEvent } from '../ports'

/**
 * In-memory accounting and payments, for tests. Records every call so a test
 * can say what was sent where, and lets a test decide how a charge ends.
 */
export function fakeAdapters(
  options: { chargeOutcome?: 'succeeded' | 'processing' | 'failed' } = {},
) {
  const customers = new Map<string, string>()
  const invoices = new Map<string, IssuedInvoice & { lines: unknown; tax: unknown }>()
  const charges: { idempotencyKey: string; amountCents: number; customerRef: string }[] = []
  const payments: { invoiceId: string; amountCents: number; paymentRef: string }[] = []
  let outcome = options.chargeOutcome ?? 'succeeded'

  const prices = new Map<string, number>([
    ['per_user', 500],
    ['per_workshop', 100],
  ])

  const adapters: BillingAdapters = {
    invoicing: {
      async planPrice(plan) {
        const price = prices.get(plan)
        if (price === undefined) throw new Error(`no article for ${plan}`)
        return price
      },
      async upsertCustomer(customer) {
        const ref = customers.get(customer.tenantId) ?? `partner-${customers.size + 1}`
        customers.set(customer.tenantId, ref)
        return ref
      },
      async findInvoice(ref) {
        return invoices.get(ref) ?? null
      },
      async issueInvoice({ ref, lines, tax }) {
        const net = lines.reduce(
          (sum, line) => sum + Math.round(line.quantity * line.unitNetCents),
          0,
        )
        const rate = tax.kind === 'domestic' ? tax.rate : 0
        const taxCents = Math.round(net * rate)
        const invoice = {
          id: `move-${invoices.size + 1}`,
          number: `INV/2026/${String(invoices.size + 1).padStart(4, '0')}`,
          netCents: net,
          taxCents,
          grossCents: net + taxCents,
          url: `https://accounting.example.test/invoice/${invoices.size + 1}`,
          lines,
          tax,
        }
        invoices.set(ref, invoice)
        return invoice
      },
      async invoiceDocument(invoiceId) {
        if (![...invoices.values()].some((invoice) => invoice.id === invoiceId)) return null
        return {
          filename: `${invoiceId}.pdf`,
          // Enough of a PDF that a test can tell it apart from nothing.
          bytes: new TextEncoder().encode(`%PDF-1.4 ${invoiceId}`),
        }
      },
      async recordPayment(payment) {
        payments.push(payment)
      },
    },
    payments: {
      async createSetupSession({ tenantId, customerRef }) {
        return {
          url: `https://payments.example.test/setup/${tenantId}`,
          customerRef: customerRef ?? `cus-${tenantId.slice(0, 8)}`,
        }
      },
      async charge({ customerRef, amountCents, idempotencyKey }) {
        const existing = charges.find((c) => c.idempotencyKey === idempotencyKey)
        if (!existing) charges.push({ idempotencyKey, amountCents, customerRef })
        return {
          paymentRef: `pi-${idempotencyKey}`,
          status: outcome,
          ...(outcome === 'failed' ? { reason: 'card_declined' } : {}),
        }
      },
      parseWebhook(body, signature) {
        if (signature !== 'valid') return null
        return JSON.parse(body) as PaymentEvent
      },
    },
  }

  return {
    adapters,
    prices,
    customers,
    invoices,
    charges,
    payments,
    setChargeOutcome: (next: typeof outcome) => {
      outcome = next
    },
  }
}
