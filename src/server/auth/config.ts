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

export type MailTransport = 'smtp' | 'graph' | 'console' | 'none'

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
  /**
   * The transport the ENVIRONMENT dictates, or undefined when it says nothing.
   *
   * Undefined is not "console" any more: an admin can configure mail in the
   * browser, and that is where an install with an empty .env now gets its
   * answer. What is actually used is resolved per send in
   * server/settings/mail-settings -- the environment first, the stored settings
   * after it.
   */
  get mailTransport(): MailTransport | undefined {
    const value = process.env.GW_MAIL_TRANSPORT
    if (!value) return undefined
    if (value !== 'smtp' && value !== 'graph' && value !== 'console' && value !== 'none') {
      throw new Error(`GW_MAIL_TRANSPORT must be smtp | graph | console | none, got: ${value}`)
    }
    return value
  },
  sessionTtlDays: Number(process.env.GW_SESSION_TTL_DAYS ?? 30),
  /**
   * How long a session may go unused before it stops working, independent of
   * the absolute lifetime above. Thirty days of absolute lifetime with no idle
   * window means a stolen or forgotten cookie stays valid for a month.
   */
  sessionIdleDays: Number(process.env.GW_SESSION_IDLE_DAYS ?? 14),
  magicLinkTtlMinutes: Number(process.env.GW_MAGIC_LINK_TTL_MINUTES ?? 15),
  /** Community Edition runs on one tenant with a fixed id. */
  defaultTenantId: '00000000-0000-0000-0000-000000000001',
} as const

/** Warnings worth printing at boot rather than discovering in a support thread. */
export function auditAuthConfig(): string[] {
  const warnings: string[] = []

  if (authConfig.appUrl.protocol !== 'https:') {
    warnings.push(
      `GW_APP_URL is ${authConfig.appUrl.origin}: the session cookie cannot be marked Secure, ` +
        'so it travels in the clear on this network. Anyone who can read the traffic can take over a session.',
    )
  }
  if (!authConfig.passkeysAvailable) {
    warnings.push(
      `GW_APP_URL is ${authConfig.appUrl.origin}: passkeys are unavailable without HTTPS. ` +
        'Magic links are the only way in. Use the `tls` compose profile.',
    )
  }
  if (authConfig.mailTransport === 'console') {
    warnings.push(
      'GW_MAIL_TRANSPORT=console: complete, working magic links are printed to stdout. ' +
        'Anyone who can read the container log -- the docker group, a log aggregator, a ' +
        'support attachment, a backup -- can request a link for any address and take that ' +
        'account. Reasonable for an install with no relay; set GW_MAIL_TRANSPORT=smtp once ' +
        'there is one.',
    )
  }
  if (authConfig.mailTransport === 'graph') {
    // Beim Start gemeldet, nicht erst beim ersten Anmeldeversuch: sonst merkt
    // es zuerst die Person, die sich nicht anmelden kann, und niemand schaut
    // dabei ins Log.
    const missing = (
      [
        ['GW_GRAPH_TENANT_ID', process.env.GW_GRAPH_TENANT_ID],
        ['GW_GRAPH_CLIENT_ID', process.env.GW_GRAPH_CLIENT_ID],
        ['GW_GRAPH_SENDER', process.env.GW_GRAPH_SENDER],
        [
          'GW_GRAPH_CLIENT_SECRET',
          process.env.GW_GRAPH_CLIENT_SECRET || process.env.GW_GRAPH_CLIENT_SECRET_FILE,
        ],
      ] as const
    )
      .filter(([, value]) => !value)
      .map(([name]) => name)

    if (missing.length > 0) {
      warnings.push(
        `GW_MAIL_TRANSPORT=graph, but ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} ` +
          'not set. No mail can be sent until this is complete.',
      )
    }
  }
  if (authConfig.mailTransport === 'none') {
    warnings.push(
      'GW_MAIL_TRANSPORT=none: no magic links can be delivered. ' +
        'Use `cli.mjs login-link` to get in, or set GW_MAIL_TRANSPORT=console.',
    )
  }
  if (authConfig.mailTransport === undefined) {
    // Not a complaint, a statement of where to look. An install that configures
    // mail in the browser is the intended path now, and warning about it on
    // every boot would train people to ignore this list.
    warnings.push(
      'GW_MAIL_TRANSPORT is not set: mail delivery follows the settings in the interface. ' +
        'Until something is configured there, no mail can be delivered.',
    )
  }
  if (!authConfig.passkeysAvailable && authConfig.mailTransport === 'none') {
    warnings.push('No passkeys AND no mail: nobody can log in. This install needs attention.')
  }
  return warnings
}
