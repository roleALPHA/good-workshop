import { BillingUnavailableError, type BillingAdapters } from '../ports'

/**
 * What `@gw/billing-adapters` resolves to unless the private build replaces it:
 * every call refuses. The worker checks `configured` at start and does not run
 * billing without real adapters; nothing here pretends to have sent an invoice.
 */
const refuse = async (): Promise<never> => {
  throw new BillingUnavailableError()
}

export const configured = false

export const adapters: BillingAdapters = {
  invoicing: {
    upsertCustomer: refuse,
    findInvoice: refuse,
    issueInvoice: refuse,
    recordPayment: refuse,
  },
  payments: {
    createSetupSession: refuse,
    charge: refuse,
    parseWebhook: () => null,
  },
}
