import { BillingUnavailableError, type BillingAdapters } from '../ports'

/**
 * What `@gw/billing-adapters` resolves to unless the private build replaces it:
 * every call refuses. The worker checks `configured` at start and does not run
 * billing without real adapters; nothing here pretends to have sent an invoice.
 *
 * Both flags are false here, and for the same reason -- but they are two
 * questions, which is why there are two of them. See BillingAdaptersModule in
 * ../ports.ts: invoicing needs an accounting system, storing a payment method
 * needs only a payment provider, and a build can have the second without the
 * first.
 */
const refuse = async (): Promise<never> => {
  throw new BillingUnavailableError()
}

export const configured = false
export const paymentsConfigured = false

export const adapters: BillingAdapters = {
  invoicing: {
    planPrice: refuse,
    upsertCustomer: refuse,
    findInvoice: refuse,
    issueInvoice: refuse,
    invoiceDocument: refuse,
    recordPayment: refuse,
  },
  payments: {
    createSetupSession: refuse,
    charge: refuse,
    parseWebhook: () => null,
  },
}
