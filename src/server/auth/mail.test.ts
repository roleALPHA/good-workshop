import { describe, expect, it } from 'vitest'
import { magicLinkMail } from './mail'
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
    expect(magicLinkMail('a@b.test', LINK, locale).text).toContain(
      'GoodWorkshop · powered by roleALPHA',
    )
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
