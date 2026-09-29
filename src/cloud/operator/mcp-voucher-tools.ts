import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { fail, ok } from '@/server/mcp/respond'
import { opGuarded } from './mcp-respond'
import { requireOperatorScope } from './scopes'
import type { OperatorActor } from './tokens'
import { operatorDb } from './db'
import { Id } from './mcp-shared'
import {
  createVoucher,
  listVouchers,
  NewVoucher,
  revokeVoucher,
  VoucherCodeInvalidError,
  VoucherCodeTakenError,
} from './vouchers'

/**
 * Vouchers, for a model: a percentage off what a workspace pays, redeemed by
 * its admin on the billing page.
 *
 * Reading needs `ops:read`; making and revoking need `ops:vouchers`. Neither is
 * staged: revoking only stops new redemptions -- a workspace keeps the discount
 * it was given -- and a voucher nobody has redeemed has cost nothing yet.
 */
export function registerOperatorVoucherTools(server: McpServer, actor: OperatorActor): void {
  const db = operatorDb()

  server.registerTool(
    'list_vouchers',
    {
      title: 'List vouchers',
      description:
        'Every voucher with its discount, how long it runs, until when it can be redeemed, how ' +
        'often it has been and may be redeemed, and whether it is active, expired, used up or ' +
        'revoked.',
      inputSchema: {},
    },
    async () =>
      opGuarded(async () => {
        requireOperatorScope(actor.scopes, 'ops:read')
        const vouchers = await listVouchers(db)
        return ok(
          vouchers
            .map((v) => `${v.id}  ${v.code}  ${v.percent}%  ${v.status}  ${v.redemptions} used`)
            .join('\n') || 'No vouchers.',
          { vouchers },
        )
      }),
  )

  server.registerTool(
    'create_voucher',
    {
      title: 'Make a voucher',
      description:
        'A code a workspace admin enters next to the payment method, taking `percent` off every ' +
        'invoice from the month it is redeemed in. 100 percent is a free month: nothing is ' +
        'invoiced for it. The months run from the first month that is billed, so a voucher ' +
        'redeemed during the trial does not lose any. One voucher per workspace at a time. ' +
        'Answers with the code, which is made up when none is given.',
      inputSchema: {
        code: NewVoucher.shape.code.describe(
          'The code to hand out: 4 to 32 letters, digits or dashes, stored in upper case. ' +
            'Omit it for a random ten-character one.',
        ),
        percent: NewVoucher.shape.percent.describe('The discount, 1 to 100.'),
        durationMonths: NewVoucher.shape.durationMonths
          .optional()
          .describe('How many billed months it discounts. Omit or null: every month, for good.'),
        redeemableUntil: NewVoucher.shape.redeemableUntil
          .optional()
          .describe('Until when it can be redeemed, ISO 8601. Omit or null: until revoked.'),
        maxRedemptions: NewVoucher.shape.maxRedemptions
          .optional()
          .describe(
            'How many workspaces may redeem it: 1 for a single-use code. Omit or null: any number.',
          ),
        note: z
          .string()
          .trim()
          .max(500)
          .optional()
          .describe(
            'For operators only, never shown to a customer: who it is for, which campaign.',
          ),
      },
    },
    async (args) =>
      opGuarded(async () => {
        requireOperatorScope(actor.scopes, 'ops:vouchers')
        try {
          const made = await createVoucher(db, actor.operatorId, {
            code: args.code ?? null,
            percent: args.percent,
            durationMonths: args.durationMonths ?? null,
            redeemableUntil: args.redeemableUntil ?? null,
            maxRedemptions: args.maxRedemptions ?? null,
            note: args.note ?? '',
          })
          return ok(`Voucher ${made.code} made.`, made)
        } catch (error) {
          // The two a model can correct by itself; everything else is opaque.
          if (error instanceof VoucherCodeTakenError || error instanceof VoucherCodeInvalidError)
            return fail(error.message)
          throw error
        }
      }),
  )

  server.registerTool(
    'revoke_voucher',
    {
      title: 'Revoke a voucher',
      description:
        'Stops the voucher from being redeemed. Workspaces that already redeemed it keep their ' +
        'discount for the months it was given for.',
      inputSchema: { voucherId: Id },
    },
    async ({ voucherId }) =>
      opGuarded(async () => {
        requireOperatorScope(actor.scopes, 'ops:vouchers')
        await revokeVoucher(db, actor.operatorId, voucherId)
        return ok('Voucher revoked.')
      }),
  )
}
