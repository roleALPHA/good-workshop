import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { OperatorScope } from './scopes'
import type * as VouchersModule from './vouchers'

/**
 * Which operator token may do what with vouchers. The database side -- what
 * the functions accept and refuse -- is ./vouchers.cloud.db.test.ts.
 */

const vouchers = vi.hoisted(() => ({
  listVouchers: vi.fn(async () => []),
  createVoucher: vi.fn(async () => ({ id: 'v-1', code: 'MADE-UP' })),
  revokeVoucher: vi.fn(async () => {}),
}))
vi.mock('./db', () => ({ operatorDb: () => ({}) }))
vi.mock('./vouchers', async (original) => ({
  ...(await original<typeof VouchersModule>()),
  ...vouchers,
}))

const { registerOperatorVoucherTools } = await import('./mcp-voucher-tools')
const { VoucherCodeTakenError } = await import('./vouchers')

type Answer = { content: { text: string }[]; isError?: boolean }
type Handler = (args: Record<string, unknown>) => Promise<Answer>

function toolsFor(scopes: OperatorScope[]) {
  const tools = new Map<string, Handler>()
  const server = {
    registerTool: (name: string, _config: unknown, handler: Handler) => tools.set(name, handler),
  } as unknown as McpServer
  registerOperatorVoucherTools(server, { operatorId: 'op-1', displayName: 'Op', scopes })
  return (name: string, args: Record<string, unknown> = {}) => tools.get(name)!(args)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the voucher tools', () => {
  it('list with ops:read, and make and revoke only with ops:vouchers', async () => {
    const reader = toolsFor(['ops:read', 'ops:lifecycle'])
    expect((await reader('list_vouchers')).isError).toBeUndefined()

    const made = await reader('create_voucher', { percent: 100 })
    expect(made.isError).toBe(true)
    expect(made.content[0]!.text).toContain('ops:vouchers')
    const revoked = await reader('revoke_voucher', { voucherId: crypto.randomUUID() })
    expect(revoked.isError).toBe(true)
    expect(vouchers.createVoucher).not.toHaveBeenCalled()
    expect(vouchers.revokeVoucher).not.toHaveBeenCalled()
  })

  it('makes a voucher, filling in what was left out as "no limit"', async () => {
    const call = toolsFor(['ops:vouchers'])
    const answer = await call('create_voucher', { percent: 20, durationMonths: 3 })
    expect(answer.content[0]!.text).toBe('Voucher MADE-UP made.')
    expect(vouchers.createVoucher).toHaveBeenCalledWith({}, 'op-1', {
      code: null,
      percent: 20,
      durationMonths: 3,
      redeemableUntil: null,
      maxRedemptions: null,
      note: '',
    })
  })

  it('tells a model the code is taken, so it can pick another', async () => {
    vouchers.createVoucher.mockRejectedValueOnce(new VoucherCodeTakenError('SPRING'))
    const answer = await toolsFor(['ops:vouchers'])('create_voucher', {
      code: 'SPRING',
      percent: 10,
    })
    expect(answer).toMatchObject({ isError: true })
    expect(answer.content[0]!.text).toContain('SPRING')
  })
})
