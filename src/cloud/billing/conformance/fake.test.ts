import { randomUUID } from 'node:crypto'
import { describeBillingAdapters } from '@gw/billing-conformance'
import { fakeAdapters, fakeWebhookSignature } from '../adapters/fake'
import type { BillingCustomer } from '../ports'

/**
 * The contract, against the fake.
 *
 * Two questions at once. That the fake behaves like an accounting system --
 * every database test in run.cloud.db.test.ts takes its word for what Odoo
 * would do, and a double that drifts from the contract makes those tests agree
 * with each other and with nothing else. And that the suite itself can be
 * green: a conformance suite that passes nowhere checks nothing, it only
 * refuses.
 *
 * Imported through `@gw/billing-conformance`, which is the specifier the
 * private build uses. A path that works only there is a path that breaks there.
 */

const WEBHOOK_BODY = JSON.stringify({ id: 'evt_1', type: 'ignored' })
const { adapters } = fakeAdapters()
let issued = 0

describeBillingAdapters({
  name: 'the fake',
  adapters,
  ref: (suffix) => `GW-FAKE-${(issued += 1)}-${suffix}`,
  customer: (overrides): BillingCustomer => ({
    tenantId: randomUUID(),
    customerRef: null,
    customerType: 'business',
    name: 'Conformance GmbH',
    email: 'conformance@example.test',
    street: 'Ring 1',
    postalCode: '1010',
    city: 'Wien',
    country: 'AT',
    vatId: null,
    locale: 'de',
    ...overrides,
  }),
  webhook: {
    body: WEBHOOK_BODY,
    signature: fakeWebhookSignature(WEBHOOK_BODY),
    expect: { id: 'evt_1', type: 'ignored' },
  },
})
