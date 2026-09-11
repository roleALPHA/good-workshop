import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * What the passkey ceremony insists on.
 *
 * In a system with no passwords, the passkey is the whole of the
 * authentication -- there is no second thing to know. `userVerification:
 * 'preferred'` together with `requireUserVerification: false` means an
 * authenticator may sign without a PIN or a fingerprint and the server will
 * take it, so brief physical access to an unlocked device is a login.
 *
 * `preferred` is the sensible default for a site where a passkey is a
 * convenience layered over a password. This is not that site.
 */

// Typed with their argument so the assertions below can read mock.calls[0][0];
// a zero-arg vi.fn gives an empty tuple type and no index to look at.
const generateRegistrationOptions = vi.fn(async (_options: Record<string, unknown>) => ({
  challenge: 'reg-challenge',
}))
const generateAuthenticationOptions = vi.fn(async (_options: Record<string, unknown>) => ({
  challenge: 'auth-challenge',
}))

// vi.mock rather than vi.spyOn: an ESM module namespace is not configurable,
// so spying on a live export throws rather than intercepting.
vi.mock('@simplewebauthn/server', () => ({
  generateRegistrationOptions,
  generateAuthenticationOptions,
  verifyRegistrationResponse: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}))

vi.mock('@/server/db', () => ({
  withAuth: vi.fn(async (fn: (tx: unknown) => unknown) =>
    fn({
      select: () => ({ from: () => ({ where: () => [] }) }),
      insert: () => ({ values: async () => undefined }),
      delete: () => ({ where: () => ({ returning: async () => [] }) }),
    }),
  ),
}))

beforeEach(() => {
  generateRegistrationOptions.mockClear()
  generateAuthenticationOptions.mockClear()
})

describe('passkey ceremony options', () => {
  it('requires user verification when registering', async () => {
    const { registrationOptions } = await import('./passkey')
    await registrationOptions('00000000-0000-0000-0000-0000000000aa', 'anna@example.test')

    expect(generateRegistrationOptions.mock.calls[0]?.[0]).toMatchObject({
      authenticatorSelection: { userVerification: 'required' },
    })
  })

  it('requires user verification when authenticating', async () => {
    const { authenticationOptions } = await import('./passkey')
    await authenticationOptions()

    expect(generateAuthenticationOptions.mock.calls[0]?.[0]).toMatchObject({
      userVerification: 'required',
    })
  })
})

describe('isCounterRegression', () => {
  it.each([
    { name: 'a counter that advanced', stored: 41, presented: 42, expected: false },
    { name: 'a counter that stood still', stored: 42, presented: 42, expected: true },
    { name: 'a counter that went backwards', stored: 42, presented: 7, expected: true },
    // The documented "this authenticator does not implement a counter" case.
    // Synced passkeys report zero forever; refusing those would lock out most
    // of the people the feature exists for.
    { name: 'an authenticator that never counts', stored: 0, presented: 0, expected: false },
    {
      name: 'the first signature from a counting authenticator',
      stored: 0,
      presented: 1,
      expected: false,
    },
  ])('$name', async ({ stored, presented, expected }) => {
    const { isCounterRegression } = await import('./passkey')
    expect(isCounterRegression({ stored, presented })).toBe(expected)
  })
})
