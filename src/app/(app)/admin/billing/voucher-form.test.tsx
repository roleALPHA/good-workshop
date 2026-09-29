import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderWithIntl } from '@/test/intl'

const redeemVoucherAction = vi.fn()
const refresh = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('./actions', () => ({
  redeemVoucherAction: (...args: unknown[]) => redeemVoucherAction(...args),
}))

const { VoucherForm } = await import('./voucher-form')

beforeEach(() => {
  redeemVoucherAction.mockReset()
  refresh.mockReset()
})

describe('the voucher form next to the payment method', () => {
  it('redeems what was typed and shows the page again', async () => {
    redeemVoucherAction.mockResolvedValue({ ok: true, data: {} })
    const user = userEvent.setup()
    renderWithIntl(<VoucherForm voucher={null} />)

    const redeem = screen.getByRole('button', { name: 'Einlösen' })
    expect(redeem).toBeDisabled()
    await user.type(screen.getByLabelText('Gutscheincode'), 'fruehling26')
    await user.click(redeem)

    expect(redeemVoucherAction).toHaveBeenCalledWith('fruehling26')
    expect(refresh).toHaveBeenCalled()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('says why a code was refused', async () => {
    redeemVoucherAction.mockResolvedValue({
      ok: false,
      message: 'Diesen Gutscheincode kennen wir nicht.',
    })
    const user = userEvent.setup()
    renderWithIntl(<VoucherForm voucher={null} />)

    await user.type(screen.getByLabelText('Gutscheincode'), 'NOPE')
    await user.keyboard('{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Diesen Gutscheincode kennen wir nicht.',
    )
    expect(refresh).not.toHaveBeenCalled()
  })

  it('shows a running voucher instead of the field', () => {
    renderWithIntl(
      <VoucherForm
        voucher={{ code: 'FRUEHLING26', percent: 20, durationMonths: 3, monthsLeft: 2 }}
      />,
    )
    expect(
      screen.getByText('Gutschein FRUEHLING26: 20 % Rabatt auf deine Rechnungen · noch 2 Monate'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText('Gutscheincode')).not.toBeInTheDocument()
  })

  it('says a free one is free, and one without an end has none', () => {
    renderWithIntl(
      <VoucherForm
        voucher={{ code: 'GRATIS', percent: 100, durationMonths: null, monthsLeft: null }}
      />,
    )
    expect(
      screen.getByText('Gutschein GRATIS: kostenlos, ohne Rechnung · unbefristet'),
    ).toBeInTheDocument()
  })
})
