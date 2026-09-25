import { describe, expect, it } from 'vitest'
import * as module from './unavailable'
import { BillingUnavailableError, type BillingAdaptersModule } from '../ports'

/**
 * The adapters a build without the private repository has.
 *
 * Worth asserting despite being a handful of lines, because the whole public
 * repository is typechecked and tested against this module and nothing else --
 * and because the two flags are the one thing the private module has to agree
 * about. A forgotten export there used to surface as a failed image build eight
 * minutes in; the list below is the cheaper place to find it.
 */

describe('billing adapters that refuse', () => {
  it('says that neither invoicing nor payments are set up', () => {
    expect(module.configured).toBe(false)
    expect(module.paymentsConfigured).toBe(false)
  })

  it('exports the whole module, so the private one cannot quietly have less', () => {
    // Reached through one alias, never both in a build. An export missing here
    // is one the public build never calls and the private build might not have.
    const required: (keyof BillingAdaptersModule)[] = [
      'configured',
      'paymentsConfigured',
      'adapters',
    ]
    expect(Object.keys(module).sort()).toEqual([...required].sort())
  })

  it('refuses every call rather than pretending', async () => {
    // Not "returns nothing": an invoice nobody can issue has to stop the run.
    // The deliberate difference from the empty catalogue next door.
    await expect(module.adapters.invoicing.planPrice('per_user')).rejects.toThrow(
      BillingUnavailableError,
    )
    await expect(
      module.adapters.payments.charge({
        customerRef: 'c',
        amountCents: 500,
        idempotencyKey: 'k',
        description: 'd',
      }),
    ).rejects.toThrow(BillingUnavailableError)
  })

  it('verifies no webhook, which is what answers a forged one with a refusal', () => {
    // Null rather than a throw: the route turns it into 400 without a stack.
    expect(module.adapters.payments.parseWebhook('{}', 'forged')).toBeNull()
  })
})
