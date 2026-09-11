import { describe, expect, it, vi } from 'vitest'

/**
 * What the passkey ceremony insists on.
 *
 * In a system with no passwords, the passkey is the whole of the authentication
 * -- there is no second thing to know. `userVerification: 'preferred'` with
 * `requireUserVerification: false` means an authenticator may sign without a
 * PIN or a fingerprint and the server will take it, so brief physical access to
 * an unlocked device is a login.
 *
 * `preferred` is the sensible default for a site where a passkey is a
 * convenience layered over a password. This is not that site.
 */

vi.mock('@/server/db', () => ({
  withAuth: vi.fn(async () => undefined),
  withTenant: vi.fn(async () => undefined),
}))

describe('passkey ceremony options', () => {
  it('requires user verification when registering', async () => {
    const simplewebauthn = await import('@simplewebauthn/server')
    const spy = vi.spyOn(simplewebauthn, 'generateRegistrationOptions')

    const { registrationOptions } = await import('./passkey')
    await registrationOptions('00000000-0000-0000-0000-0000000000aa', 'anna@example.test').catch(
      () => undefined,
    )

    expect(spy.mock.calls[0]?.[0]).toMatchObject({
      authenticatorSelection: { userVerification: 'required' },
    })
  })

  it('requires user verification when authenticating', async () => {
    const simplewebauthn = await import('@simplewebauthn/server')
    const spy = vi.spyOn(simplewebauthn, 'generateAuthenticationOptions')

    const { authenticationOptions } = await import('./passkey')
    await authenticationOptions().catch(() => undefined)

    expect(spy.mock.calls[0]?.[0]).toMatchObject({ userVerification: 'required' })
  })
})

describe('signature counter', () => {
  it('treats a counter that went backwards as a cloned authenticator', async () => {
    // The counter is written on every login and compared against nothing. Its
    // entire purpose is to reveal a copied credential: a clone and the original
    // cannot both keep counting up. Storing it without comparing it is the
    // bookkeeping without the point.
    const { isCounterRegression } = await import('./passkey')

    expect(isCounterRegression({ stored: 41, presented: 42 })).toBe(false)
    expect(isCounterRegression({ stored: 42, presented: 42 })).toBe(true)
    expect(isCounterRegression({ stored: 42, presented: 7 })).toBe(true)
  })

  it('tolerates authenticators that do not count at all', () => {
    // A stored and presented zero is the documented "this authenticator does
    // not implement a counter" case, not a clone. Treating it as an attack
    // would lock out every such key.
    return import('./passkey').then(({ isCounterRegression }) => {
      expect(isCounterRegression({ stored: 0, presented: 0 })).toBe(false)
    })
  })
})
