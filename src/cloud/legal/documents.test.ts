import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  LEGAL_DOCUMENTS,
  documentVersion,
  readLegalDocument,
  readLegalVersion,
  type LegalDocument,
} from './documents'

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
    version: '2026-09-18',
    sha256: 'b77a0140446dfe4478ca8be7fbf995cc71c1abf707c3a1a011dfd5959df91732',
  },
  agb: {
    version: '2026-09-18',
    sha256: '1a1de81de81516acfe5048e1c6b7860679993fdbcfc67572b2f0608bc89e592e',
  },
  datenschutz: {
    version: '2026-09-18',
    sha256: '3f06e290b54dd410a88434ce0c52fef8450da7fb15ea938be80442851eb82258',
  },
  avv: {
    version: '2026-09-18',
    sha256: '656685db6ddcc2f720a9350f1949fb05a98270d071264a406f31e545d06a53a7',
  },
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
      .update(await readLegalDocument(document))
      .digest('hex')
    expect(
      digest,
      `${document}.md changed. Date the change in its "Stand:" line and update both lines in PUBLISHED.`,
    ).toBe(PUBLISHED[document].sha256)
  })
})
