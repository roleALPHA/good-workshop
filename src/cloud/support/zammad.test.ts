import { describe, expect, it, vi } from 'vitest'
import { createTicket, zammadConfig } from './zammad'

/**
 * The support form's one outbound call: a ticket in the helpdesk.
 *
 * What these hold onto: the request Zammad expects (group, customer by e-mail,
 * a customer article), that a helpdesk that is down or refuses is an answer and
 * not an exception, and that the token never ends up in the text that is
 * logged when it does.
 */

const config = {
  url: 'https://helpdesk.example.test/',
  token: 'secret-token-123',
  group: 'GoodWorkshop',
}

const ticket = {
  subject: 'Export bricht ab',
  body: 'Beim Export kommt eine leere Datei.',
  customerEmail: 'anna@example.com',
}

const reply = (status: number, body: unknown) =>
  vi
    .fn()
    .mockResolvedValue(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
    )

describe('creating a ticket', () => {
  it('posts the ticket to the group, with the person as customer', async () => {
    const fetch = reply(201, { id: 42, number: '31001' })
    const result = await createTicket(config, ticket, { fetch })

    expect(result).toEqual({ status: 'created', id: 42, number: '31001' })
    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://helpdesk.example.test/api/v1/tickets')
    expect(init.method).toBe('POST')
    expect(init.headers.authorization).toBe('Token token=secret-token-123')
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(init.body)).toEqual({
      title: 'Export bricht ab',
      group: 'GoodWorkshop',
      customer_id: 'guess:anna@example.com',
      article: {
        subject: 'Export bricht ab',
        body: 'Beim Export kommt eine leere Datei.',
        type: 'web',
        sender: 'Customer',
        content_type: 'text/plain',
        internal: false,
      },
    })
  })

  it('reports a refusal as unavailable, with what the helpdesk said', async () => {
    const result = await createTicket(config, ticket, {
      fetch: reply(422, { error: 'No such group' }),
    })
    expect(result).toEqual({ status: 'unavailable', error: 'HTTP 422: {"error":"No such group"}' })
  })

  it('reports a helpdesk that is down as unavailable', async () => {
    const fetch = vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
    expect(await createTicket(config, ticket, { fetch })).toEqual({
      status: 'unavailable',
      error: 'TimeoutError',
    })
  })

  it('treats a success without a ticket number as unavailable', async () => {
    expect(await createTicket(config, ticket, { fetch: reply(200, '<html>') })).toEqual({
      status: 'unavailable',
      error: 'HTTP 200: <html>',
    })
  })

  it('never puts the token into the error, even when the helpdesk echoes it', async () => {
    const result = await createTicket(config, ticket, {
      fetch: reply(401, 'invalid token secret-token-123'),
    })
    expect(result.status).toBe('unavailable')
    expect(JSON.stringify(result)).not.toContain('secret-token-123')
  })

  it('caps what it keeps of a long error body', async () => {
    const result = await createTicket(config, ticket, { fetch: reply(500, 'x'.repeat(5_000)) })
    expect(result.status === 'unavailable' && result.error.length).toBeLessThanOrEqual(520)
  })
})

describe('the configuration', () => {
  it('is complete only with address, group and token', () => {
    expect(zammadConfig({})).toBeNull()
    expect(
      zammadConfig({ GW_ZAMMAD_URL: 'https://h.test', GW_ZAMMAD_GROUP: 'GoodWorkshop' }),
    ).toBeNull()
    expect(
      zammadConfig({
        GW_ZAMMAD_URL: 'https://h.test',
        GW_ZAMMAD_GROUP: 'GoodWorkshop',
        GW_ZAMMAD_TOKEN: 't',
      }),
    ).toEqual({ url: 'https://h.test', group: 'GoodWorkshop', token: 't' })
  })

  it('reads the token from a file when one is named', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const file = join(mkdtempSync(join(tmpdir(), 'zammad-')), 'token')
    writeFileSync(file, 'from-file\n')
    expect(
      zammadConfig({
        GW_ZAMMAD_URL: 'https://h.test',
        GW_ZAMMAD_GROUP: 'GoodWorkshop',
        GW_ZAMMAD_TOKEN: 'from-env',
        GW_ZAMMAD_TOKEN_FILE: file,
      })?.token,
    ).toBe('from-file')
  })
})
