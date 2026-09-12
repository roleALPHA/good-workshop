import { readFileSync } from 'node:fs'
import { withTenantOnly } from '@/server/db'
import { readStoredMail, resolveMailConfig, type MailConfig } from '@/server/settings/mail-settings'
import { authConfig } from './config'
import type { Locale } from '@/i18n/config'
import { translator } from '@/i18n/translator'
import { DomainError } from '@/domain/errors'
import { ATTRIBUTION_TEXT } from '@/lib/attribution'

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
          `To:      ${mail.to}`,
          `Subject: ${mail.subject}`,
          '',
          mail.text,
          '─'.repeat(72),
          '',
        ].join('\n'),
      )
      return

    case 'smtp': {
      if (!config.smtpUrl) {
        throw new MailConfigError('mail.noSmtpUrl')
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
      throw new MailConfigError('mail.transportNone')
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
  const sender = required(config.graphSender, 'the sender mailbox (GW_GRAPH_SENDER)')

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

  const tenant = required(config.graphTenantId, 'the tenant (GW_GRAPH_TENANT_ID)')
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: required(config.graphClientId, 'the application id (GW_GRAPH_CLIENT_ID)'),
        client_secret: required(
          config.graphClientSecret,
          'the client secret (GW_GRAPH_CLIENT_SECRET)',
        ),
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
/**
 * A misconfiguration, not a relay failure.
 *
 * These three reach the admin screen verbatim -- which is the point of that
 * screen -- so they are ours to say, in the reader's language. What is NOT
 * translated is what the relay itself answers ("535 authentication failed");
 * see failRelayed in src/server/actions/context.ts.
 *
 * The `field` argument stays English: it names an environment variable.
 */
export class MailConfigError extends DomainError {}

function required(value: string | undefined, label: string): string {
  if (!value) throw new MailConfigError('mail.graphMissing', { field: label })
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

/**
 * The recipient's language, not the sender's and not the request's.
 *
 * A German admin inviting a Spanish colleague sends a Spanish mail. That means
 * the locale is a parameter: `getTranslations()` would resolve against whoever
 * happened to trigger the send, and there are sends with no request at all.
 *
 * The signature line is NOT translated and not interpolated from tenant data --
 * docs/ui-conventions.md says so about the footer, and a mail is the same
 * surface reaching the same person.
 */
export function magicLinkMail(to: string, link: string, locale: Locale): Mail {
  const t = translator(locale, 'mail.magicLink')
  return {
    to,
    subject: t('subject'),
    text: [t('body', { link, minutes: authConfig.magicLinkTtlMinutes }), '', ATTRIBUTION_TEXT].join(
      '\n',
    ),
  }
}

/**
 * The invitation to one agenda, for somebody with no account.
 *
 * It says the address out loud, because the link asks for it: the recipient has
 * to know WHICH of their addresses opens it, and an invitation forwarded within a
 * team otherwise turns into "it does not work" with nothing to go on.
 *
 * No expiry in minutes here, unlike a magic link. This one is valid for as long
 * as the workshop is, which is a sentence about the agenda rather than a number,
 * and inventing a deadline the code does not enforce is worse than saying nothing.
 */
export function shareInviteMail(
  to: string,
  link: string,
  workshopTitle: string,
  locale: Locale,
): Mail {
  const t = translator(locale, 'mail.shareInvite')
  return {
    to,
    subject: t('subject', { workshop: workshopTitle }),
    text: [t('body', { workshop: workshopTitle, link, email: to }), '', ATTRIBUTION_TEXT].join(
      '\n',
    ),
  }
}
