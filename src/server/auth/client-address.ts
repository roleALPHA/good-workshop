/**
 * The caller's address, as far as it can be known.
 *
 * `X-Forwarded-For` is a list a client starts and every proxy appends to. The
 * entries a client wrote are its own invention; only the ones appended by
 * infrastructure you control mean anything. So the useful value is counted
 * from the RIGHT, by the number of proxies that actually sit in front of this
 * process -- with the `tls` compose profile that is one, Caddy.
 *
 * The old code read the whole header raw, including any commas the client put
 * there, and wrote it into `email_token.requested_ip`. Nothing derived identity
 * or a limit from it, so nothing was broken; it simply was not an audit trail
 * either.
 *
 * This value is for RATE LIMITING AND LOGGING ONLY. An operator who sets
 * GW_TRUSTED_PROXIES wrong, or who exposes the app directly, gets a key an
 * attacker can vary at will -- which costs them a throttle and must never cost
 * them an authorisation. Nothing in this codebase may branch on it.
 */
export function clientAddress(headers: { get: (name: string) => string | null }): string {
  const trusted = Number(process.env.GW_TRUSTED_PROXIES ?? 1)
  const forwarded = headers.get('x-forwarded-for')

  if (forwarded) {
    const hops = forwarded
      .split(',')
      .map((hop) => hop.trim())
      .filter(Boolean)

    // With one trusted proxy the last entry is the one it appended.
    const index = hops.length - Math.max(trusted, 1)
    if (index >= 0 && hops[index]) return hops[index]
  }

  // No header and no socket address to fall back on in this runtime: one shared
  // bucket is still a limit, just a blunt one.
  return headers.get('x-real-ip')?.trim() || 'unknown'
}
