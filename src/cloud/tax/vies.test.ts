import { describe, expect, it, vi } from 'vitest'
import { checkVatId } from './vies'

const now = () => new Date('2026-09-18T10:00:00Z')
const reply = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }))

describe('checkVatId', () => {
  it('sends a qualified request and keeps the consultation number', async () => {
    const fetch = reply(200, {
      valid: true,
      name: 'BERGER GMBH',
      address: 'RING 1\n1010 WIEN',
      requestIdentifier: 'WAPIAAAAY2q',
      userError: 'VALID',
    })

    const result = await checkVatId('DE123456789', { requesterVatId: 'ATU11111111', fetch, now })

    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
      countryCode: 'DE',
      vatNumber: '123456789',
      requesterMemberStateCode: 'AT',
      requesterNumber: 'U11111111',
    })
    expect(result).toEqual({
      status: 'valid',
      vatId: 'DE123456789',
      name: 'BERGER GMBH',
      address: 'RING 1\n1010 WIEN',
      consultationNumber: 'WAPIAAAAY2q',
      checkedAt: '2026-09-18T10:00:00.000Z',
    })
  })

  it('says invalid, and drops the fields a member state does not disclose', async () => {
    const result = await checkVatId('DE000000000', {
      fetch: reply(200, { valid: false, name: '---', address: '---', userError: 'INVALID' }),
      now,
    })
    expect(result).toMatchObject({ status: 'invalid', name: null, address: null })
  })

  it.each([
    [
      'a member state that is down',
      reply(200, { valid: false, userError: 'MS_UNAVAILABLE' }),
      'MS_UNAVAILABLE',
    ],
    ['an HTTP error', reply(503, { message: 'down' }), 'HTTP 503'],
    ['a body that is not an answer', reply(200, { hello: 'world' }), 'HTTP 200'],
    ['a network failure', vi.fn().mockRejectedValue(new TypeError('fetch failed')), 'TypeError'],
  ])('never calls %s invalid', async (_, fetch, error) => {
    expect(await checkVatId('DE123456789', { fetch, now })).toEqual({
      status: 'unavailable',
      vatId: 'DE123456789',
      error,
      checkedAt: '2026-09-18T10:00:00.000Z',
    })
  })
})
