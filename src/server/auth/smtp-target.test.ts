import { describe, expect, it } from 'vitest'
import { smtpTarget, type Resolve } from './smtp-target'

/**
 * A cloud workspace types an SMTP URL, and our server connects to it.
 *
 * That makes the URL a way to reach whatever our server can reach: the
 * database next door, the operator console, the metadata service of the host.
 * The test message relays the error verbatim, so even a refused connection
 * would answer "is something listening there?". Hence: submission ports only,
 * public addresses only, and the address checked is the address dialled.
 */

const resolvesTo =
  (...addresses: string[]): Resolve =>
  async () =>
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))

const PUBLIC = resolvesTo('93.184.216.10')

describe('where a workspace may send its mail from', () => {
  it('dials the address it checked, and checks the certificate against the name', async () => {
    const target = await smtpTarget('smtps://u%40kunde:p%2Fw@mail.kunde.example', PUBLIC)

    expect(target).toMatchObject({
      host: '93.184.216.10',
      port: 465,
      secure: true,
      auth: { user: 'u@kunde', pass: 'p/w' },
      tls: { servername: 'mail.kunde.example' },
    })
  })

  it('insists on STARTTLS on the submission port', async () => {
    const target = await smtpTarget('smtp://u:p@mail.kunde.example:587', PUBLIC)
    expect(target).toMatchObject({ port: 587, secure: false, requireTLS: true })
  })

  it.each(['smtp://relay.example:25', 'smtp://relay.example:5432', 'smtps://relay.example:3000'])(
    'refuses %s: only the two submission ports',
    async (url) => {
      await expect(smtpTarget(url, PUBLIC)).rejects.toThrow('mail.smtpPortNotAllowed')
    },
  )

  it.each([
    ['loopback', '127.0.0.1'],
    ['a private network', '10.1.2.3'],
    ['a docker network', '172.18.0.4'],
    ['a home network', '192.168.1.1'],
    ['link-local, the cloud metadata service', '169.254.169.254'],
    ['carrier-grade NAT', '100.64.0.1'],
    ['nowhere', '0.0.0.0'],
    ['IPv6 loopback', '::1'],
    ['an IPv6 unique local address', 'fd00::1'],
    ['IPv6 link-local', 'fe80::1'],
    ['loopback dressed as IPv6', '::ffff:127.0.0.1'],
  ])('refuses a host that resolves to %s', async (_what, address) => {
    await expect(smtpTarget('smtps://relay.example', resolvesTo(address))).rejects.toThrow(
      'mail.smtpHostNotPublic',
    )
  })

  it('refuses a name with one private address among public ones', async () => {
    // Which one the connection would take is not ours to predict.
    await expect(
      smtpTarget('smtps://relay.example', resolvesTo('93.184.216.10', '10.0.0.5')),
    ).rejects.toThrow('mail.smtpHostNotPublic')
  })

  it('refuses an address typed in directly, without asking DNS', async () => {
    const neverAsked: Resolve = async () => {
      throw new Error('should not resolve a literal')
    }
    await expect(smtpTarget('smtps://[::1]:465', neverAsked)).rejects.toThrow(
      'mail.smtpHostNotPublic',
    )
    await expect(smtpTarget('smtps://127.0.0.1', neverAsked)).rejects.toThrow(
      'mail.smtpHostNotPublic',
    )
  })

  it.each(['https://relay.example', 'not a url', 'smtps://'])(
    'refuses %s as not an SMTP URL',
    async (url) => {
      await expect(smtpTarget(url, PUBLIC)).rejects.toThrow('mail.smtpUrlInvalid')
    },
  )

  it('says so when the name does not resolve', async () => {
    const nothing: Resolve = async () => {
      throw Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' })
    }
    await expect(smtpTarget('smtps://relay.invalid', nothing)).rejects.toThrow(
      'mail.smtpHostUnknown',
    )
  })
})
