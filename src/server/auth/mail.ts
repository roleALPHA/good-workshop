import { readFileSync } from 'node:fs'
import { withTenantOnly } from '@/server/db'
import { readStoredMail, resolveMailConfig, type MailConfig } from '@/server/settings/mail-settings'
import { authConfig } from './config'

/**
 * Mail delivery, with `console` as a first-class transport rather than a
 * development hack.
 *
 * An on-prem install without an SMTP relay is normal, and if magic links have
 * nowhere to go, nobody can log in. Printing them to stdout keeps that install
 * usable: the operator reads the link out of `docker compose logs`.
 *
 * `graph` exists for the same reason from the other direction: a Microsoft 365
 * tenant with SMTP AUTH switched off has no relay to point at, and the choice
 * there is Graph or nothing.
 */

export type Mail = { to: string; subject: string; text: string }

/**
 * The configuration in force for a tenant: what the environment sets, filled up
 * with what an admin configured in the browser.
 *
 * Read per send rather than cached. Mail is not a hot path -- a login link, an
 * invitation -- and the alternative is an operator changing the relay and
 * wondering why it takes a restart.
 *
 * The two *_FILE variables are resolved here because only this layer should
 * touch the filesystem; resolveMailConfig stays a pure function.
 */
export async function mailConfigFor(tenantId: string): Promise<MailConfig> {
  const stored = await withTenantOnly(tenantId, (tx) => readStoredMail(tx, tenantId))

  return resolveMailConfig(stored, {
    ...process.env,
    SMTP_URL: fromFileOrValue(process.env.SMTP_URL_FILE, process.env.SMTP_URL),
    GW_GRAPH_CLIENT_SECRET: fromFileOrValue(
      process.env.GW_GRAPH_CLIENT_SECRET_FILE,
      process.env.GW_GRAPH_CLIENT_SECRET,
    ),
  })
}

function fromFileOrValue(file: string | undefined, value: string | undefined) {
  if (file) return readFileSync(file, 'utf8').trim()
  return value || undefined
}

export async function sendMail(mail: Mail, tenantId: string): Promise<void> {
  const config = await mailConfigFor(tenantId)

  switch (config.transport) {
    case 'console':
      console.log(
        [
          '',
          '─'.repeat(72),
          `An:      ${mail.to}`,
          `Betreff: ${mail.subject}`,
          '',
          mail.text,
          '─'.repeat(72),
          '',
        ].join('\n'),
      )
      return

    case 'smtp': {
      if (!config.smtpUrl) {
        throw new Error(
          'Transport smtp, aber keine SMTP-URL konfiguriert -- weder in der Umgebung noch in den Einstellungen.',
        )
      }
      const { createTransport } = await import('nodemailer')
      await createTransport(config.smtpUrl).sendMail({
        from: config.smtpFrom ?? 'goodworkshop@localhost',
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      })
      return
    }

    case 'graph':
      await sendViaGraph(mail, config)
      return

    case 'none':
      throw new Error(
        'Transport none: es kann keine Mail versendet werden. `node scripts/cli.mjs login-link --email ...` ' +
          'oder einen Transport in den Einstellungen wählen.',
      )
  }
}

/**
 * Microsoft Graph, for tenants that have no SMTP relay to offer.
 *
 * Plenty of Microsoft 365 organisations have switched SMTP AUTH off entirely --
 * there the choice is not "smtp or graph" but "graph or no mail at all". It
 * needs an app registration with the APPLICATION permission `Mail.Send`,
 * admin-consented, and the mailbox to send from.
 *
 * Deliberately over `fetch` and not the Graph SDK: two HTTP calls against a
 * stable, documented API, against a dependency tree of a hundred-odd packages
 * in an image that ships to other people's servers.
 */
async function sendViaGraph(mail: Mail, config: MailConfig): Promise<void> {
  const sender = required(config.graphSender, 'Absenderpostfach (GW_GRAPH_SENDER)')

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(sender)}/sendMail`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await graphToken(config)}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject: mail.subject,
          body: { contentType: 'Text', content: mail.text },
          toRecipients: [{ emailAddress: { address: mail.to } }],
        },
        // `Mail.Send` alone may not write to the sent folder, and a login link
        // is not worth keeping a copy of anyway.
        saveToSentItems: false,
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`Microsoft Graph refused the message: ${await graphError(response)}`)
  }
}

/** Cached until shortly before it expires -- a token is good for about an hour,
 *  and fetching one per mail costs a round trip on every login attempt. */
let cachedToken: { value: string; expiresAt: number } | undefined

async function graphToken(config: MailConfig): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.value

  const tenant = required(config.graphTenantId, 'Mandant (GW_GRAPH_TENANT_ID)')
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: required(config.graphClientId, 'Anwendungs-ID (GW_GRAPH_CLIENT_ID)'),
        client_secret: required(config.graphClientSecret, 'Client Secret'),
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`Microsoft Graph refused the credentials: ${await graphError(response)}`)
  }

  const token = (await response.json()) as { access_token?: string; expires_in?: number }
  if (!token.access_token) {
    throw new Error('Microsoft Graph returned no access_token.')
  }

  // A minute of headroom, so a token cannot expire between this check and the
  // request that uses it.
  cachedToken = {
    value: token.access_token,
    expiresAt: Date.now() + Math.max((token.expires_in ?? 3600) - 60, 30) * 1000,
  }
  return cachedToken.value
}

/**
 * The error text, without the request that produced it.
 *
 * A failing token request carries the client secret in its body, and anything
 * that echoes a request back into a log is how secrets end up in support
 * attachments. Only the response is read, and only as far as it stays a
 * message.
 */
async function graphError(response: Response): Promise<string> {
  const body = await response.text().catch(() => '')
  let detail = body.slice(0, 500)
  try {
    const parsed = JSON.parse(body) as {
      error?: string | { message?: string }
      error_description?: string
    }
    const message =
      typeof parsed.error === 'string' ? parsed.error_description : parsed.error?.message
    if (message) detail = message
  } catch {
    // Not JSON. The truncated body is still the most useful thing available.
  }
  return `${response.status} ${detail}`.trim()
}

/**
 * A value the transport cannot work without.
 *
 * Named in the message the way an operator sees it -- the form label and the
 * environment variable -- because it is now configurable in two places and
 * "GW_GRAPH_SENDER is not set" would be misleading for somebody who has never
 * touched a .env.
 */
function required(value: string | undefined, label: string): string {
  if (!value) throw new Error(`Transport graph, aber ${label} fehlt.`)
  return value
}

/** Test seam: the token outlives a single call by design, which would otherwise
 *  leak between test cases. */
export function resetGraphTokenCache(): void {
  cachedToken = undefined
}

/**
 * Whether mail actually reaches the person it is addressed to.
 *
 * `console` delivers to the server log, which is the right behaviour for an
 * install without a relay and is NOT delivery: anything that offers somebody a
 * link has to know the difference, or it will tell an admin their invitation
 * was sent when it went to stdout on a machine they may not have.
 */
export function deliversToRecipient(config: MailConfig): boolean {
  return config.transport === 'smtp' || config.transport === 'graph'
}

export function magicLinkMail(to: string, link: string): Mail {
  return {
    to,
    subject: 'Dein Anmeldelink für GoodWorkshop',
    text: [
      'Hallo,',
      '',
      'hier ist dein Anmeldelink:',
      link,
      '',
      `Er gilt ${authConfig.magicLinkTtlMinutes} Minuten und lässt sich nur einmal verwenden.`,
      '',
      'Wenn du das nicht angefordert hast, kannst du diese Nachricht ignorieren —',
      'ohne den Link passiert nichts.',
      '',
      'GoodWorkshop · powered by roleALPHA',
    ].join('\n'),
  }
}
