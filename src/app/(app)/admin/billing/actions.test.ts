import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeAdapters } from '@/cloud/billing/adapters/fake'

/**
 * Which flag decides that a workspace may be offered a hosted page for a
 * payment method.
 *
 * Not the one that says billing works. Storing a card needs a payment provider;
 * issuing an invoice needs an accounting system as well. The web container has
 * the first and deliberately not the second -- it holds a restricted Stripe key
 * and no accounting key at all -- so while one flag answered both questions, a
 * correctly configured production container told its customers that payments
 * were not set up.
 */

// Who is signed in, and what storing a payment method does to the database,
// both have their own tests. What this file is about is the branch above them.
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }))
vi.mock('@/server/auth/session', () => ({
  readSession: async () => ({ tenantId: 't-1', memberId: 'm-1', tenantRole: 'admin' }),
}))
vi.mock('@/cloud/workspace/account', () => ({
  startPaymentSetup: async () => 'https://payments.example.test/setup/t-1',
  changePlan: async () => {},
  updateBillingDetails: async () => {},
  requestWorkspaceDeletion: async () => new Date(),
  cancelWorkspaceDeletion: async () => {},
  requestCancellation: async () => new Date(),
  withdrawCancellation: async () => {},
}))
const redeemVoucher = vi.hoisted(() =>
  vi.fn(async (_actor: unknown, code: unknown) => ({
    code: String(code).toUpperCase(),
    percent: 20,
    durationMonths: 3,
    monthsLeft: 3,
  })),
)
vi.mock('@/cloud/workspace/voucher', () => ({ redeemVoucher }))

/** The action as a build with these flags sees it. */
async function actionWith(flags: { configured: boolean; paymentsConfigured: boolean }) {
  vi.resetModules()
  vi.doMock('@gw/billing-adapters', () => ({ ...flags, adapters: fakeAdapters().adapters }))
  return (await import('./actions')).startPaymentSetupAction
}

beforeEach(() => {
  vi.resetModules()
})

describe('starting the payment setup', () => {
  it('opens a hosted page with a payment provider and no accounting system', async () => {
    // Exactly what the `app` service in the private deploy/compose.yaml is: the
    // restricted Stripe key, the webhook secret, no Odoo key.
    const action = await actionWith({ configured: false, paymentsConfigured: true })
    expect(await action()).toEqual({
      ok: true,
      data: { url: 'https://payments.example.test/setup/t-1' },
    })
  })

  it('says nothing is set up when there is no payment provider either', async () => {
    // A build without the private adapters, which is what the page's warning is
    // for: there is nowhere to send the browser.
    const action = await actionWith({ configured: false, paymentsConfigured: false })
    expect(await action()).toEqual({ ok: true, data: null })
  })

  it('offers it to a workspace whose billing is fully configured as well', async () => {
    const action = await actionWith({ configured: true, paymentsConfigured: true })
    expect(await action()).toEqual({
      ok: true,
      data: { url: 'https://payments.example.test/setup/t-1' },
    })
  })
})

describe('redeeming a voucher', () => {
  it('redeems it for the signed-in workspace', async () => {
    const { redeemVoucherAction } = await import('./actions')
    expect(await redeemVoucherAction('spring26')).toEqual({
      ok: true,
      data: { code: 'SPRING26', percent: 20, durationMonths: 3, monthsLeft: 3 },
    })
    expect(redeemVoucher).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't-1' }),
      'spring26',
    )
  })

  it('stops a workspace from trying code after code', async () => {
    const { redeemVoucherAction } = await import('./actions')
    redeemVoucher.mockClear()
    const answers = []
    for (let attempt = 0; attempt < 12; attempt++) answers.push(await redeemVoucherAction('X'))
    // Ten an hour: plenty for somebody mistyping, nothing for somebody guessing.
    expect(redeemVoucher).toHaveBeenCalledTimes(10)
    expect(answers.at(-1)).toMatchObject({ ok: false, messageKey: 'errors.tooManyRequests' })
  })
})
