/**
 * Auth configuration, resolved once and validated loudly.
 *
 * Two of these values are the reason on-prem installs fail, so they are
 * checked here rather than discovered by a user who cannot log in:
 *
 *  - Passkeys need HTTPS. Outside localhost, WebAuthn simply does not run on
 *    http://, so an install on http://192.168.1.50:3000 has no passkey path at
 *    all. That is why magic links are a full second route and not a fallback.
 *  - GW_RP_ID is bound to the hostname. Changing it after people have
 *    registered passkeys invalidates every one of them, silently.
 */

export type MailTransport = 'smtp' | 'console' | 'none'

function appUrl(): URL {
  const raw = process.env.GW_APP_URL ?? 'http://localhost:3000'
  try {
    return new URL(raw)
  } catch {
    throw new Error(`GW_APP_URL is not a valid URL: ${raw}`)
  }
}

export const authConfig = {
  get appUrl() {
    return appUrl()
  },
  get origin() {
    return appUrl().origin
  },
  /** The WebAuthn Relying Party ID. Defaults to the host of GW_APP_URL. */
  get rpId() {
    return process.env.GW_RP_ID ?? appUrl().hostname
  },
  get rpName() {
    return process.env.GW_RP_NAME ?? 'GoodWorkshop'
  },
  /** localhost is the one origin where browsers allow WebAuthn without TLS. */
  get passkeysAvailable() {
    const url = appUrl()
    return url.protocol === 'https:' || url.hostname === 'localhost' || url.hostname === '127.0.0.1'
  },
  get mailTransport(): MailTransport {
    const value = process.env.GW_MAIL_TRANSPORT ?? 'console'
    if (value !== 'smtp' && value !== 'console' && value !== 'none') {
      throw new Error(`GW_MAIL_TRANSPORT must be smtp | console | none, got: ${value}`)
    }
    return value
  },
  sessionTtlDays: Number(process.env.GW_SESSION_TTL_DAYS ?? 30),
  magicLinkTtlMinutes: Number(process.env.GW_MAGIC_LINK_TTL_MINUTES ?? 15),
  /** Community Edition runs on one tenant with a fixed id. */
  defaultTenantId: '00000000-0000-0000-0000-000000000001',
} as const

/** Warnings worth printing at boot rather than discovering in a support thread. */
export function auditAuthConfig(): string[] {
  const warnings: string[] = []

  if (!authConfig.passkeysAvailable) {
    warnings.push(
      `GW_APP_URL is ${authConfig.appUrl.origin}: passkeys are unavailable without HTTPS. ` +
        'Magic links are the only way in. Use the `tls` compose profile.',
    )
  }
  if (authConfig.mailTransport === 'none') {
    warnings.push(
      'GW_MAIL_TRANSPORT=none: no magic links can be delivered. ' +
        'Use `cli.mjs login-link` to get in, or set GW_MAIL_TRANSPORT=console.',
    )
  }
  if (!authConfig.passkeysAvailable && authConfig.mailTransport === 'none') {
    warnings.push('No passkeys AND no mail: nobody can log in. This install needs attention.')
  }
  return warnings
}
