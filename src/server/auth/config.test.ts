import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { auditAuthConfig, authConfig } from './config'

/**
 * The boot-time audit of the auth configuration.
 *
 * Two failures this file exists to catch:
 *
 *  1. A default that is convenient in development and dangerous in production.
 *     `GW_MAIL_TRANSPORT=console` prints complete, working magic links to
 *     stdout. Anyone who can read `docker logs` -- the docker group, a log
 *     aggregator, a support attachment, a backup -- can request a link for any
 *     address and take the account. It is a reasonable transport for an install
 *     with no relay; it is not a reasonable thing to get by saying nothing.
 *  2. An audit that nobody runs. Warnings that are never printed are worth
 *     exactly as much as no warnings at all, which is why the last test here
 *     asserts the wiring and not just the text.
 */

const ENV_KEYS = ['GW_APP_URL', 'GW_MAIL_TRANSPORT', 'GW_RP_ID', 'GW_RP_NAME'] as const
let saved: Record<string, string | undefined>

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
})

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  vi.restoreAllMocks()
})

describe('auditAuthConfig', () => {
  it.each([
    {
      name: 'console transport prints credentials to the log',
      env: { GW_APP_URL: 'https://ws.example.com', GW_MAIL_TRANSPORT: 'console' },
      expected: /GW_MAIL_TRANSPORT=console/,
    },
    {
      name: 'no mail transport at all',
      env: { GW_APP_URL: 'https://ws.example.com', GW_MAIL_TRANSPORT: 'none' },
      expected: /GW_MAIL_TRANSPORT=none/,
    },
    {
      name: 'plain http cannot mark the cookie Secure',
      env: { GW_APP_URL: 'http://192.168.1.50:3000', GW_MAIL_TRANSPORT: 'smtp' },
      expected: /Secure/,
    },
    {
      name: 'plain http has no passkeys',
      env: { GW_APP_URL: 'http://192.168.1.50:3000', GW_MAIL_TRANSPORT: 'smtp' },
      expected: /passkeys are unavailable/,
    },
  ])('warns: $name', ({ env, expected }) => {
    Object.assign(process.env, env)
    expect(auditAuthConfig().join('\n')).toMatch(expected)
  })

  it('stays quiet when the install is actually sound', () => {
    process.env.GW_APP_URL = 'https://ws.example.com'
    process.env.GW_MAIL_TRANSPORT = 'smtp'
    expect(auditAuthConfig()).toEqual([])
  })
})

describe('authConfig', () => {
  // compose.yaml passes `GW_RP_ID: ${GW_RP_ID:-}`, so a value left out of the
  // .env arrives as an empty string, not as an absent variable. The browser
  // then refuses every passkey: 'The RP ID "" is invalid for this domain'.
  it('treats an empty GW_RP_ID as unset and falls back to the host of GW_APP_URL', () => {
    process.env.GW_APP_URL = 'https://ws.example.com'
    process.env.GW_RP_ID = ''
    expect(authConfig.rpId).toBe('ws.example.com')
  })

  it('uses GW_RP_ID when it is set', () => {
    process.env.GW_APP_URL = 'https://ws.example.com'
    process.env.GW_RP_ID = 'example.com'
    expect(authConfig.rpId).toBe('example.com')
  })

  it('treats an empty GW_RP_NAME as unset', () => {
    process.env.GW_RP_NAME = ''
    expect(authConfig.rpName).toBe('GoodWorkshop')
  })
})
