import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The support form's action: who may send, what is checked, and what reaches
 * the helpdesk. The request itself has its own test in
 * src/cloud/support/zammad.test.ts.
 */

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => 'de',
}))
const session = vi.hoisted(() => ({
  current: null as null | Record<string, unknown>,
}))
vi.mock('@/server/auth/session', () => ({ readSession: async () => session.current }))
vi.mock('@/server/db', () => ({
  withTenant: async () => [{ name: 'Beispiel GmbH' }],
}))
vi.mock('@/lib/version', () => ({ displayVersion: () => 'v9.9.9' }))
const support = vi.hoisted(() => ({
  config: { url: 'https://h.test', token: 't', group: 'GoodWorkshop' } as unknown,
  createTicket: vi.fn(),
}))
vi.mock('@/cloud/support/zammad', () => ({
  zammadConfig: () => support.config,
  createTicket: support.createTicket,
}))

const anna = {
  tenantId: 't-1',
  memberId: 'm-1',
  tenantRole: 'admin',
  email: 'anna@example.com',
  displayName: 'Anna Berger',
}
const valid = { subject: 'Export bricht ab', message: 'Beim Export kommt eine leere Datei.' }

async function send(raw: unknown) {
  return (await import('./actions')).sendSupportRequestAction(raw)
}

beforeEach(() => {
  vi.resetModules()
  session.current = anna
  support.config = { url: 'https://h.test', token: 't', group: 'GoodWorkshop' }
  support.createTicket.mockReset()
  support.createTicket.mockResolvedValue({ status: 'created', id: 7, number: '31007' })
})

describe('sending a support request', () => {
  it('refuses somebody who is not signed in', async () => {
    session.current = null
    expect(await send(valid)).toMatchObject({ ok: false, error: 'unauthenticated' })
    expect(support.createTicket).not.toHaveBeenCalled()
  })

  it('refuses a subject or a message that is too short', async () => {
    expect(await send({ ...valid, subject: 'a' })).toMatchObject({
      ok: false,
      error: 'invalid_input',
    })
    expect(await send({ ...valid, message: 'kurz' })).toMatchObject({
      ok: false,
      error: 'invalid_input',
    })
    expect(support.createTicket).not.toHaveBeenCalled()
  })

  it('opens a ticket for the person and says its number', async () => {
    expect(await send(valid)).toEqual({ ok: true, data: { number: '31007' } })

    const [config, ticket] = support.createTicket.mock.calls[0]!
    expect(config).toEqual(support.config)
    expect(ticket.subject).toBe('Export bricht ab')
    expect(ticket.customerEmail).toBe('anna@example.com')
    // What support needs to answer without asking back first.
    expect(ticket.body).toContain('Beim Export kommt eine leere Datei.')
    expect(ticket.body).toContain('Anna Berger <anna@example.com>')
    expect(ticket.body).toContain('Beispiel GmbH')
    expect(ticket.body).toContain('admin')
    expect(ticket.body).toContain('v9.9.9')
    expect(ticket.body).toContain('de')
  })

  it('says so when the helpdesk cannot be reached', async () => {
    support.createTicket.mockResolvedValue({ status: 'unavailable', error: 'HTTP 503' })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await send(valid)).toMatchObject({
      ok: false,
      error: 'failed',
      messageKey: 'errors.supportUnavailable',
    })
    spy.mockRestore()
  })

  it('says so when no helpdesk is configured', async () => {
    support.config = null
    expect(await send(valid)).toMatchObject({
      ok: false,
      messageKey: 'errors.supportUnavailable',
    })
    expect(support.createTicket).not.toHaveBeenCalled()
  })

  it('stops a member after five requests an hour', async () => {
    const { sendSupportRequestAction } = await import('./actions')
    for (let i = 0; i < 5; i++) {
      expect(await sendSupportRequestAction(valid)).toMatchObject({ ok: true })
    }
    expect(await sendSupportRequestAction(valid)).toMatchObject({
      ok: false,
      messageKey: 'errors.tooManyRequests',
    })
    expect(support.createTicket).toHaveBeenCalledTimes(5)
  })
})
