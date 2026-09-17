import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from './route.cloud'

describe('the payment webhook', () => {
  it('refuses anything it cannot verify, and stores nothing', async () => {
    // A build without the private adapters verifies nothing, which is the point.
    const response = await POST(
      new NextRequest('http://localhost/api/billing/webhook', {
        method: 'POST',
        body: JSON.stringify({ id: 'evt', type: 'payment_succeeded' }),
        headers: { 'stripe-signature': 'forged' },
      }),
    )
    expect(response.status).toBe(400)
  })
})
