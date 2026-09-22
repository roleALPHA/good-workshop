import { createHash } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LEGAL_DOCUMENTS,
  documentVersion,
  readLegalDocument,
  readLegalVersion,
  type LegalDocument,
} from './documents'
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/i18n/config'

/**
 * The published wording and the version it is filed under, held together.
 *
 * A consent records a version (`billing_account.terms_version`). If the text
 * can change without the version changing, that record points at wording that
 * was never published, and the right to object to a change (AGB § 14) rests on
 * nothing. The digest is a tripwire, not a source of truth: it fails the moment
 * a text is edited, and the fix is to date the edit in the `Stand:` line and
 * bring the two lines here along with it.
 */
const PUBLISHED: Record<LegalDocument, { version: string; sha256: string }> = {
  impressum: {
    version: '2026-09-22',
    sha256: 'a2a6034179905f560a927ad463db8e8f90be1a676fde6b91dbe4e265272aadce',
  },
  agb: {
    version: '2026-09-22',
    sha256: '6c0cecd3982b69c16cca7bb79f0cbbbb08c493a599819bea36d9b8444041d3eb',
  },
  datenschutz: {
    version: '2026-09-22',
    sha256: '4a2152bd47da7f9d6e7103cfee3333950093926504bfa2d6ea4454fe97c92178',
  },
  avv: {
    version: '2026-09-22',
    sha256: 'd776975147052f664dc57dfdb55e3d9704b45c038cb1f7b76f8ed02fc2e657c1',
  },
}

/**
 * The sentence every translation has to carry, in its own language.
 *
 * Only the German wording binds. A translation that does not say so is worse
 * than no translation: somebody reads it, acts on it, and finds out afterwards
 * that the version they read was never the contract. The test is over the
 * FILES rather than over the ones we happen to have today, so the next language
 * cannot be added without it.
 */
const BINDING_NOTICE: Record<Exclude<Locale, 'de'>, RegExp> = {
  en: /Only the German version .* is legally binding/,
  fr: /Seule la version allemande .* fait foi/,
  es: /Solo la versión alemana .* es jurídicamente vinculante/,
}

describe('the version of a legal text', () => {
  it('is the date of its "Stand:" line', () => {
    expect(documentVersion('# Titel\n\nStand: 18. September 2026\n\nText')).toBe('2026-09-18')
    expect(documentVersion('Stand: 1. März 2027')).toBe('2027-03-01')
  })

  it('accepts Jänner as well as Januar, because the texts are Austrian', () => {
    expect(documentVersion('Stand: 7. Jänner 2027')).toBe('2027-01-07')
    expect(documentVersion('Stand: 7. Januar 2027')).toBe('2027-01-07')
  })

  it('refuses rather than invents one', () => {
    expect(() => documentVersion('# Titel\n\nKein Datum')).toThrow('Stand:')
    expect(() => documentVersion('Stand: 3. Smarch 2027')).toThrow('unknown month')
  })
})

describe('every published text', () => {
  it.each(LEGAL_DOCUMENTS)('%s carries the version it is filed under', async (document) => {
    expect(await readLegalVersion(document)).toBe(PUBLISHED[document].version)
  })

  it.each(LEGAL_DOCUMENTS)('%s is the wording that version stands for', async (document) => {
    const digest = createHash('sha256')
      .update((await readLegalDocument(document)).source)
      .digest('hex')
    expect(
      digest,
      `${document}.md changed. Date the change in its "Stand:" line and update both lines in PUBLISHED.`,
    ).toBe(PUBLISHED[document].sha256)
  })
})

describe('every translation', () => {
  const files = readdirSync(join(process.cwd(), 'src', 'cloud', 'legal')).filter((name) =>
    /\.[a-z]{2}\.md$/.test(name),
  )

  it('exists for every document and every language the application carries', () => {
    const wanted = LEGAL_DOCUMENTS.flatMap((document) =>
      LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).map(
        (locale) => `${document}.${locale}.md`,
      ),
    )
    expect(files.sort()).toEqual(wanted.sort())
  })

  it.each(
    LEGAL_DOCUMENTS.flatMap((document) =>
      LOCALES.filter((locale) => locale !== DEFAULT_LOCALE).map(
        (locale) => [document, locale] as const,
      ),
    ),
  )('%s in %s says that only the German version binds', async (document, locale) => {
    const { source, locale: served } = await readLegalDocument(document, locale)
    expect(served).toBe(locale)
    expect(
      source,
      `${document}.${locale}.md has to say that only the German version binds.`,
    ).toMatch(BINDING_NOTICE[locale as Exclude<Locale, 'de'>])
  })

  it('falls back to German for a language nothing was translated into', async () => {
    // Not a language the application carries: the loader answers with the
    // binding text rather than with nothing.
    const { source, locale } = await readLegalDocument('agb', 'it' as Locale)
    expect(locale).toBe(DEFAULT_LOCALE)
    expect(source).toContain('Allgemeine Geschäftsbedingungen')
  })
})
