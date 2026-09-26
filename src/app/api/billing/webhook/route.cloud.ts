import { NextResponse, type NextRequest } from 'next/server'
import { sql } from 'drizzle-orm'
import { adapters } from '@gw/billing-adapters'
import { withoutTenant } from '@/server/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Where the payment provider reports what happened.
 *
 * Verified, stored, answered. The billing worker acts on the stored event;
 * doing that here would mean a slow accounting system holds up the provider's
 * request until it retries, and a retry acts twice. The signature is checked by
 * the adapter, over the raw body; an event that does not verify is refused and
 * never stored.
 *
 * Storing is not quite nothing, though: recording that a payment method now
 * exists marks the account as having one, inside the same function (see
 * app.cloud_record_payment_event). That is no decision and no call to anybody
 * -- it is what the provider just said, and the page the customer returns to
 * from the hosted form has to be able to say it. Everything that is a decision
 * stays with the run.
 */
export async function POST(request: NextRequest) {
  const body = await request.text()
  const event = adapters.payments.parseWebhook(body, request.headers.get('stripe-signature'))
  if (!event) return NextResponse.json({ error: 'invalid_signature' }, { status: 400 })

  await withoutTenant((tx) =>
    tx.execute(
      sql`select app.cloud_record_payment_event(${event.id}, ${event.type}, ${JSON.stringify(event)}::jsonb)`,
    ),
  )
  return NextResponse.json({ received: true })
}
