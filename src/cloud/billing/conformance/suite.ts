import { describe, expect, it } from 'vitest'
import { PLAN_KEYS, type PlanKey } from '../plans'
import { implausible } from '../run'
import { netCents } from '../usage'
import { AUSTRIAN_VAT_RATE, type TaxTreatment } from '../../tax/treatment'
import type {
  BillingAdapters,
  BillingCustomer,
  InvoicingPort,
  PaymentEvent,
  PaymentPort,
} from '../ports'

/**
 * What an accounting system and a payment provider have to do, as a test suite
 * anybody can point at their implementation.
 *
 * The real adapters live in the private cloud build; this repository has the
 * contract (../ports.ts) and a fake. Between the two sat an assumption nobody
 * had written down: every database test in run.cloud.db.test.ts believes the
 * fake, and the first time the promise is checked against Odoo and Stripe would
 * otherwise be the first invoice a customer receives.
 *
 * So the promise is a suite, and it runs twice: here against the fake, and in
 * the private build against staging. Only relative imports, so that build needs
 * one alias rather than two.
 */

export type ConformanceTarget = {
  /** Named in every test title: 'the fake', 'Odoo staging'. */
  name: string
  adapters: BillingAdapters
  /**
   * A reference that has never been used there before.
   *
   * Against a staging system the suite runs again next week, and a fixed
   * reference would find last week's invoice -- proving an idempotence that was
   * never exercised.
   */
  ref: (suffix: string) => string
  /** A customer the system accepts. The suite sets country and VAT id itself. */
  customer: (overrides?: Partial<BillingCustomer>) => BillingCustomer
  /** A signed event body from the provider's own test tooling. */
  webhook?: { body: string; signature: string; expect: PaymentEvent }
  /** An accounting system does not render a PDF in a millisecond; a fake does. */
  documentTimeoutMs?: number
  /** What this target can do. What it cannot is skipped, never faked green. */
  can?: { charge?: boolean; documents?: boolean; setup?: boolean }
  cleanup?: () => Promise<void>
}

/**
 * One statement per method of each port.
 *
 * A method added to ports.ts without a sentence here is a compile error in the
 * lint job -- which is the only check that can hold for a contract whose other
 * implementation this repository never sees.
 */
const COVERED: {
  invoicing: Record<keyof InvoicingPort, string>
  payments: Record<keyof PaymentPort, string>
} = {
  invoicing: {
    planPrice: 'answers in whole cents for every plan',
    upsertCustomer: 'returns the same reference for the same workspace',
    findInvoice: 'finds what issueInvoice issued, and nothing else',
    issueInvoice: 'computes net, tax and gross the way the run expects',
    invoiceDocument: 'is null until there is a document, then a PDF',
    recordPayment: 'books a payment against the invoice it belongs to',
  },
  payments: {
    createSetupSession: 'hands out a hosted page and a customer reference',
    charge: 'charges once per idempotency key',
    parseWebhook: 'refuses anything whose signature does not verify',
  },
}

const AT = { country: 'AT', vatId: null }
const DE = { country: 'DE', vatId: 'DE123456789' }
const CH = { country: 'CH', vatId: null }

/** What may actually be invoiced: `hold` stops the run before it gets here. */
type Billable = Exclude<TaxTreatment, { kind: 'hold' }>

const domestic: Billable = { kind: 'domestic', country: 'AT', rate: AUSTRIAN_VAT_RATE }
const reverseCharge: Billable = { kind: 'reverse_charge', country: 'DE' }
const exported: Billable = { kind: 'export', country: 'CH' }

/** The quantities the run actually produces: whole, fractional and tiny. */
const AMOUNTS: [quantity: number, unitNetCents: number][] = [
  [1, 500],
  [1.52, 500],
  [0.03, 500],
  [31, 100],
  [2.5, 333],
]

export function describeBillingAdapters(target: ConformanceTarget): void {
  const { adapters, ref, customer } = target
  const can = { charge: true, documents: true, setup: true, ...target.can }
  const line = (quantity: number, unitNetCents: number, plan: PlanKey = 'per_user') => ({
    description: `GoodWorkshop — conformance, ${quantity} × ${unitNetCents}`,
    quantity,
    unitNetCents,
    plan,
  })

  describe(`${target.name} as an accounting system`, () => {
    it(COVERED.invoicing.planPrice, async () => {
      for (const plan of PLAN_KEYS) {
        const price = await adapters.invoicing.planPrice(plan)
        // The run throws on anything else, mid-pass, after it has already
        // closed months.
        expect(Number.isInteger(price), `${plan} costs ${price}`).toBe(true)
        expect(price).toBeGreaterThanOrEqual(0)
        expect(await adapters.invoicing.planPrice(plan)).toBe(price)
      }
    })

    it(COVERED.invoicing.upsertCustomer, async () => {
      const one = customer(AT)
      const first = await adapters.invoicing.upsertCustomer(one)
      expect(first).toBeTruthy()
      const again = await adapters.invoicing.upsertCustomer({ ...one, customerRef: first })
      expect(again).toBe(first)
    })

    it(COVERED.invoicing.findInvoice, async () => {
      // Null rather than a throw: invoicePeriods asks this about every period
      // it is about to invoice, and most of them have never been invoiced.
      expect(await adapters.invoicing.findInvoice(ref('never-issued'))).toBeNull()
    })

    it('finds the invoice it already issued under that reference', async () => {
      const reference = ref('idempotent')
      const customerRef = await adapters.invoicing.upsertCustomer(customer(AT))
      const issued = await adapters.invoicing.issueInvoice({
        customerRef,
        ref: reference,
        lines: [line(1, 500)],
        tax: domestic,
        collectedAfter: new Date(Date.now() + 2 * 86_400_000),
        locale: 'de',
      })

      const found = await adapters.invoicing.findInvoice(reference)
      expect(found).not.toBeNull()
      expect(found).toMatchObject({
        id: issued.id,
        number: issued.number,
        netCents: issued.netCents,
        taxCents: issued.taxCents,
        grossCents: issued.grossCents,
      })
    })

    it('never issues a second invoice under a reference it already used', async () => {
      const reference = ref('twice')
      const customerRef = await adapters.invoicing.upsertCustomer(customer(AT))
      const input = {
        customerRef,
        ref: reference,
        lines: [line(1, 500)],
        tax: domestic,
        collectedAfter: new Date(Date.now() + 2 * 86_400_000),
        locale: 'de' as const,
      }
      const first = await adapters.invoicing.issueInvoice(input)

      // Either answer is safe. A second invoice number is not: the run would
      // collect twice, and the customer would have two documents for one month.
      let second: { number: string } | null = null
      try {
        second = await adapters.invoicing.issueInvoice(input)
      } catch {
        second = null
      }
      if (second) expect(second.number).toBe(first.number)
      expect((await adapters.invoicing.findInvoice(reference))!.number).toBe(first.number)
    })

    it.each(AMOUNTS)(
      `${COVERED.invoicing.issueInvoice}: %s × %i cents`,
      async (quantity, unitNetCents) => {
        const customerRef = await adapters.invoicing.upsertCustomer(customer(AT))
        const invoice = await adapters.invoicing.issueInvoice({
          customerRef,
          ref: ref(`amount-${quantity}-${unitNetCents}`),
          lines: [line(quantity, unitNetCents)],
          tax: domestic,
          collectedAfter: new Date(Date.now() + 2 * 86_400_000),
          locale: 'de',
        })

        const expected = netCents(quantity, unitNetCents)
        // Asked with the run's own check rather than a second set of rounding
        // rules: what matters is that the production path would let it through.
        expect(
          implausible(
            { net_cents: expected, tax_kind: 'domestic', tax_rate: AUSTRIAN_VAT_RATE },
            invoice,
          ),
        ).toBeNull()
      },
    )

    it.each([
      ['domestic', domestic, AT, AUSTRIAN_VAT_RATE],
      ['reverse charge', reverseCharge, DE, 0],
      ['export', exported, CH, 0],
    ] as const)('applies %s the way the run computed it', async (name, tax, where, rate) => {
      const customerRef = await adapters.invoicing.upsertCustomer(customer(where))
      const invoice = await adapters.invoicing.issueInvoice({
        customerRef,
        ref: ref(`tax-${name.replace(/\s/g, '-')}`),
        lines: [line(2, 500)],
        tax,
        collectedAfter: new Date(Date.now() + 2 * 86_400_000),
        locale: where === AT ? 'de' : 'en',
      })

      expect(invoice.netCents).toBe(1000)
      expect(invoice.taxCents).toBe(Math.round(1000 * rate))
      expect(invoice.grossCents).toBe(invoice.netCents + invoice.taxCents)
      expect(
        implausible({ net_cents: 1000, tax_kind: tax.kind, tax_rate: rate }, invoice),
      ).toBeNull()
      // Whether the document carries the reverse-charge sentence is not
      // visible through this port. Only a person reading the PDF can say, which
      // is what the invoice captures in the private build are for.
    })

    it.skipIf(!can.documents)(COVERED.invoicing.invoiceDocument, async () => {
      expect(await adapters.invoicing.invoiceDocument(ref('no-such-invoice'))).toBeNull()

      const customerRef = await adapters.invoicing.upsertCustomer(customer(AT))
      const invoice = await adapters.invoicing.issueInvoice({
        customerRef,
        ref: ref('document'),
        lines: [line(1, 500)],
        tax: domestic,
        collectedAfter: new Date(Date.now() + 2 * 86_400_000),
        locale: 'de',
      })

      const deadline = Date.now() + (target.documentTimeoutMs ?? 0)
      let document = await adapters.invoicing.invoiceDocument(invoice.id)
      while (!document && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        document = await adapters.invoicing.invoiceDocument(invoice.id)
      }

      expect(document).not.toBeNull()
      expect(document!.filename).toMatch(/\.pdf$/i)
      expect(new TextDecoder().decode(document!.bytes.slice(0, 5))).toBe('%PDF-')
    })

    it(COVERED.invoicing.recordPayment, async () => {
      const customerRef = await adapters.invoicing.upsertCustomer(customer(AT))
      const invoice = await adapters.invoicing.issueInvoice({
        customerRef,
        ref: ref('paid'),
        lines: [line(1, 500)],
        tax: domestic,
        collectedAfter: new Date(Date.now() + 2 * 86_400_000),
        locale: 'de',
      })
      await expect(
        adapters.invoicing.recordPayment({
          invoiceId: invoice.id,
          amountCents: invoice.grossCents,
          paidAt: new Date(),
          paymentRef: ref('payment'),
        }),
      ).resolves.toBeUndefined()
    })
  })

  describe(`${target.name} as a payment provider`, () => {
    it.skipIf(!can.setup)(COVERED.payments.createSetupSession, async () => {
      const session = await adapters.payments.createSetupSession({
        tenantId: '0198a2b3-c4d5-7e6f-8a9b-0c1d2e3f4a5b',
        customerRef: null,
        email: 'setup@example.test',
        returnUrl: 'https://goodworkshop.example/admin/billing',
      })
      // Card details never touch us; the only way there is a hosted page.
      expect(session.url).toMatch(/^https:/)
      expect(session.customerRef).toBeTruthy()
    })

    it.skipIf(!can.charge)(COVERED.payments.charge, async () => {
      const key = ref('charge')
      const input = {
        customerRef: (
          await adapters.payments.createSetupSession({
            tenantId: '0198a2b3-c4d5-7e6f-8a9b-0c1d2e3f4a5b',
            customerRef: null,
            email: 'charge@example.test',
            returnUrl: 'https://goodworkshop.example/admin/billing',
          })
        ).customerRef,
        amountCents: 1200,
        idempotencyKey: key,
        description: 'GoodWorkshop conformance',
      }

      const first = await adapters.payments.charge(input)
      expect(['succeeded', 'processing', 'failed']).toContain(first.status)
      if (first.status === 'failed') expect(first.reason).toBeTruthy()

      // The run retries a charge it is not sure about. Without this the
      // customer is debited once per retry.
      const again = await adapters.payments.charge(input)
      expect(again.paymentRef).toBe(first.paymentRef)

      const other = await adapters.payments.charge({ ...input, idempotencyKey: ref('charge-2') })
      expect(other.paymentRef).not.toBe(first.paymentRef)
    })

    it(COVERED.payments.parseWebhook, () => {
      const body = target.webhook?.body ?? JSON.stringify({ id: 'evt_1', type: 'ignored' })
      expect(adapters.payments.parseWebhook(body, null)).toBeNull()
      expect(adapters.payments.parseWebhook(body, 'not-a-signature')).toBeNull()
    })

    it.skipIf(!target.webhook)('reads an event whose signature verifies', () => {
      const { body, signature, expect: event } = target.webhook!
      expect(adapters.payments.parseWebhook(body, signature)).toEqual(event)
      // The same signature over a different body must not verify, or the
      // signature is checked against nothing.
      expect(adapters.payments.parseWebhook(`${body} `, signature)).not.toEqual(event)
    })
  })

  if (target.cleanup) {
    describe(`${target.name} afterwards`, () => {
      it('leaves nothing behind that a person has to clear up', async () => {
        await expect(target.cleanup!()).resolves.not.toThrow()
      })
    })
  }
}
