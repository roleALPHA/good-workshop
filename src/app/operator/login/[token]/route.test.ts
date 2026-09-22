import { beforeEach, describe, expect, it, vi } from 'vitest'

const spendSignInLink = vi.fn()
const startOperatorSession = vi.fn()

vi.mock('@/cloud/operator/db', () => ({
  operatorConsoleEnabled: () => true,
  operatorDb: () => ({ query: vi.fn() }),
}))
vi.mock('@/cloud/operator/auth', () => ({
  spendSignInLink: (...args: unknown[]) => spendSignInLink(...args),
}))
vi.mock('@/cloud/operator/session', () => ({
  startOperatorSession: (...args: unknown[]) => startOperatorSession(...args),
}))

const { GET } = await import('./route.cloud')

/**
 * The link from the mail, as a route rather than a page.
 *
 * It was a page first, and a page may not set a cookie while it renders --
 * Next refuses, the console showed an error, and the link looked broken to
 * whoever had just asked for it. A route handler may, which is the whole
 * reason this file exists.
 */

const call = (token: string) =>
  GET(new Request(`https://ops.example.test/operator/login/${token}`), {
    params: Promise.resolve({ token }),
  })

describe('the sign-in link', () => {
  beforeEach(() => {
    spendSignInLink.mockReset()
    startOperatorSession.mockReset()
  })

  it('starts the session and goes to the console', async () => {
    spendSignInLink.mockResolvedValue({ id: 'op-1', email: 'ops@example.test', displayName: 'Ops' })

    const response = await call('good-token')

    expect(startOperatorSession).toHaveBeenCalledWith('op-1')
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/operator')
  })

  it('sends a spent or wrong link back to the sign-in page, and starts nothing', async () => {
    spendSignInLink.mockResolvedValue(null)

    const response = await call('used-token')

    expect(startOperatorSession).not.toHaveBeenCalled()
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/operator/login?link=invalid')
  })
})
