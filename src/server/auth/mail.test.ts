import { afterEach, describe, expect, it, vi } from 'vitest'
import { magicLinkMail } from './mail'
import { ATTRIBUTION_TEXT } from '@/lib/attribution'
import { LOCALES } from '@/i18n/config'

/**
 * The mail is written in the RECIPIENT's language.
 *
 * Not the sender's and not the request's: a German admin inviting a Spanish
 * colleague sends a Spanish mail, and a magic link requested at three in the
 * morning has no interface language at all. That is why the locale is a
 * parameter rather than something read from the request -- and why this is
 * testable without one.
 */

const LINK = 'https://workshop.example.com/verify?token=abc'

describe('magicLinkMail', () => {
  it.each([
    ['de', 'Dein Anmeldelink', 'Hallo'],
    ['en', 'Your sign-in link', 'Hello'],
    ['fr', 'Ton lien de connexion', 'Bonjour'],
    ['es', 'Tu enlace de acceso', 'Hola'],
  ] as const)('writes to a %s reader in their own language', (locale, subject, greeting) => {
    const mail = magicLinkMail('kollegin@example.test', LINK, locale)
    expect(mail.subject).toContain(subject)
    expect(mail.text).toContain(greeting)
    expect(mail.text).toContain(LINK)
  })

  it.each(LOCALES)('keeps the attribution line untranslated in %s', (locale) => {
    // docs/ui-conventions.md says this string is not in the catalogs and is
    // not interpolated from tenant data. A mail reaches the same person as the
    // footer does.
    expect(magicLinkMail('a@b.test', LINK, locale).text).toContain(ATTRIBUTION_TEXT)
  })

  it('spells the two addresses out, because a mail has nothing to click', () => {
    const { text } = magicLinkMail('a@b.test', LINK, 'de')
    expect(text).toContain('rolealpha.com')
    // The terms, spelled out: a licence name on its own does not tell anybody
    // what they may do, and a mail has nothing to click.
    expect(text).toContain('Apache-2.0 + Commons Clause')
    expect(text).toContain('github.com/roleALPHA/good-workshop/blob/main/LICENSE')
    expect(text).not.toContain('](')
  })

  it.each(LOCALES)('renders every argument in %s -- no leftover placeholders', (locale) => {
    const mail = magicLinkMail('a@b.test', LINK, locale)
    expect(mail.subject + mail.text).not.toMatch(/\{[a-zA-Z]/)
  })

  it('says how long the link is valid, with the right plural', () => {
    // The TTL used to be the literal "15" in prose while the value was
    // configurable. It is a plural argument now, which is also why the French
    // and Spanish catalogs need a `many` category.
    expect(magicLinkMail('a@b.test', LINK, 'en').text).toMatch(/\d+ minutes/)
    expect(magicLinkMail('a@b.test', LINK, 'fr').text).toMatch(/\d+ minutes/)
  })
})

describe('mail from the platform itself', () => {
  const kept = { ...process.env }
  afterEach(() => {
    process.env = { ...kept }
  })

  it('takes its settings from the environment alone', async () => {
    // The operator console runs as a role that cannot read a tenant's stored
    // mail settings -- it has no grant on any tenant table. Sending through
    // the tenant path therefore failed with "DATABASE_URL is not set", which
    // is what kept the console's sign-in links from going out at all.
    process.env.GW_MAIL_TRANSPORT = 'console'
    delete process.env.DATABASE_URL

    const { sendPlatformMail } = await import('./mail')
    const printed = vi.spyOn(console, 'log').mockImplementation(() => {})
    await sendPlatformMail({ to: 'ops@example.test', subject: 'Hallo', text: 'Ein Link' })

    expect(printed).toHaveBeenCalled()
    expect(printed.mock.calls.flat().join(' ')).toContain('ops@example.test')
    printed.mockRestore()
  })

  it('says so when no transport is configured, rather than dropping the mail', async () => {
    delete process.env.GW_MAIL_TRANSPORT
    delete process.env.SMTP_URL
    delete process.env.DATABASE_URL

    const { sendPlatformMail } = await import('./mail')
    await expect(
      sendPlatformMail({ to: 'ops@example.test', subject: 'Hallo', text: 'Ein Link' }),
    ).rejects.toThrow()
  })
})
