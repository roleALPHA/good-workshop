import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { DomainError } from '@/domain/errors'

/**
 * Where a cloud workspace's SMTP relay may be, and how we reach it.
 *
 * On a self-hosted install the person typing the SMTP URL runs the server, and
 * whatever it can reach is theirs anyway. In the cloud it is a customer, and
 * the URL is a way to make OUR server connect somewhere: the database next
 * door, the operator console, the host's metadata service. The test message
 * shows the relay's answer verbatim, so even "connection refused" would tell
 * them what listens where.
 *
 * Three rules, each closing one door:
 * - Only the submission ports, 465 and 587. A relay on anything else is not a
 *   mail provider a workspace would use, and every other port is a service.
 * - Only public addresses -- every address the name resolves to, because which
 *   one a connection takes is not ours to predict.
 * - The address checked is the address dialled. Resolving once to check and
 *   letting nodemailer resolve again would let a name answer differently the
 *   second time. The name stays as `servername`, so the certificate is still
 *   checked against it.
 *
 * Query parameters of the URL are not passed on: they are how nodemailer would
 * be told to skip certificate checks, and a customer's credentials travel in
 * this connection.
 */

export type Resolve = (host: string) => Promise<{ address: string; family: number }[]>

export type SmtpTarget = {
  host: string
  port: number
  secure: boolean
  requireTLS: boolean
  auth?: { user: string; pass: string }
  tls: { servername: string }
}

const SUBMISSION_PORTS = new Set([465, 587])

const notPublic = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8], // "this network"
  ['10.0.0.0', 8],
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8],
  ['169.254.0.0', 16], // link-local, where cloud metadata lives
  ['172.16.0.0', 12], // docker's default networks among them
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, and the broadcast address
] as const) {
  notPublic.addSubnet(network, prefix, 'ipv4')
}
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['64:ff9b::', 96], // NAT64
  ['100::', 64], // discard
  ['2001:db8::', 32], // documentation
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  notPublic.addSubnet(network, prefix, 'ipv6')
}
// No rule for IPv4-mapped IPv6 (::ffff:0:0/96): BlockList checks a mapped
// address against the IPv4 rules above, and a rule for the whole range would
// in turn match every IPv4 address.

const systemResolve: Resolve = (host) => lookup(host, { all: true, verbatim: true })

export async function smtpTarget(
  url: string,
  resolve: Resolve = systemResolve,
): Promise<SmtpTarget> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new SmtpTargetError('mail.smtpUrlInvalid')
  }
  if ((parsed.protocol !== 'smtp:' && parsed.protocol !== 'smtps:') || !parsed.hostname) {
    throw new SmtpTargetError('mail.smtpUrlInvalid')
  }

  const implicitTls = parsed.protocol === 'smtps:'
  const port = parsed.port ? Number(parsed.port) : implicitTls ? 465 : 587
  if (!SUBMISSION_PORTS.has(port)) throw new SmtpTargetError('mail.smtpPortNotAllowed')

  // `hostname` keeps the brackets of an IPv6 literal.
  const name = parsed.hostname.replace(/^\[(.*)\]$/, '$1')
  const addresses = isIP(name) ? [name] : await addressesOf(name, resolve)
  if (addresses.length === 0 || addresses.some(isNotPublic)) {
    throw new SmtpTargetError('mail.smtpHostNotPublic')
  }

  const secure = implicitTls || port === 465
  return {
    host: addresses[0]!,
    port,
    secure,
    // On 587 the credentials follow STARTTLS. Without this, a relay that does
    // not offer it would receive them in the clear.
    requireTLS: !secure,
    ...(parsed.username
      ? {
          auth: {
            user: decodeURIComponent(parsed.username),
            pass: decodeURIComponent(parsed.password),
          },
        }
      : {}),
    // A literal address has no name to check a certificate against; the
    // address itself is what the certificate would have to name.
    tls: { servername: name },
  }
}

async function addressesOf(name: string, resolve: Resolve): Promise<string[]> {
  try {
    return (await resolve(name)).map((entry) => entry.address)
  } catch {
    throw new SmtpTargetError('mail.smtpHostUnknown')
  }
}

function isNotPublic(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return notPublic.check(address, 'ipv4')
  if (family === 6) return notPublic.check(address, 'ipv6')
  return true
}

/** A URL this edition will not connect to. Ours to say, so it is translated. */
export class SmtpTargetError extends DomainError {}
