import { readFileSync } from 'node:fs'
import { authConfig } from './config'

/**
 * Mail delivery, with `console` as a first-class transport rather than a
 * development hack.
 *
 * An on-prem install without an SMTP relay is normal, and if magic links have
 * nowhere to go, nobody can log in. Printing them to stdout keeps that install
 * usable: the operator reads the link out of `docker compose logs`.
 */

export type Mail = { to: string; subject: string; text: string }

export async function sendMail(mail: Mail): Promise<void> {
  switch (authConfig.mailTransport) {
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
      const url = smtpUrl()
      if (!url) {
        throw new Error('GW_MAIL_TRANSPORT=smtp but neither SMTP_URL nor SMTP_URL_FILE is set.')
      }
      const { createTransport } = await import('nodemailer')
      await createTransport(url).sendMail({
        from: process.env.SMTP_FROM ?? 'goodworkshop@localhost',
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
      })
      return
    }

    case 'none':
      throw new Error(
        'GW_MAIL_TRANSPORT=none: no mail can be sent. Use `node scripts/cli.mjs login-link --email ...`.',
      )
  }
}

/**
 * The one real secret in the stack, read from a file when there is one.
 *
 * `SMTP_URL` carries user and password by convention. As an environment
 * variable it is visible in `docker inspect`, in /proc/<pid>/environ to every
 * process in the container, and in any core dump. `SMTP_URL_FILE` is the
 * ordinary Docker/Compose secrets shape, and it keeps the value on a tmpfs
 * mount instead.
 *
 * Read on demand rather than at import: a rotated secret then takes effect on
 * the next mail rather than on the next restart.
 */
function smtpUrl(): string | undefined {
  const file = process.env.SMTP_URL_FILE
  if (file) return readFileSync(file, 'utf8').trim()
  return process.env.SMTP_URL || undefined
}

/**
 * Whether mail actually reaches the person it is addressed to.
 *
 * `console` delivers to the server log, which is the right behaviour for an
 * install without a relay and is NOT delivery: anything that offers somebody a
 * link has to know the difference, or it will tell an admin their invitation
 * was sent when it went to stdout on a machine they may not have.
 */
export function deliversToRecipient(): boolean {
  return authConfig.mailTransport === 'smtp'
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
