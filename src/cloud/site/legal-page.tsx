import { getLocale, getTranslations } from 'next-intl/server'
import { LegalMarkdown } from '@/cloud/legal/markdown'
import { readLegalDocument, type LegalDocument } from '@/cloud/legal/documents'
import { asLocale } from '@/i18n/resolve'

/**
 * One legal text, in the reader's language where there is one.
 *
 * The note above it is not a formality: only the German wording binds, and
 * somebody reading the Spanish version has to know that before they read it
 * rather than after. It stays on the German page too, where it says the plain
 * thing -- this is the version that counts.
 */
export async function LegalPage({ document }: { document: LegalDocument }) {
  const [wanted, t] = await Promise.all([getLocale(), getTranslations('site.legal')])
  const { source, locale } = await readLegalDocument(document, asLocale(wanted) ?? undefined)

  return (
    <article lang={locale} className="max-w-3xl">
      <p lang={wanted} className="mb-6 text-[14px] text-[var(--fg-muted)]">
        {locale === 'de' && wanted !== 'de' ? t('notTranslated') : t('germanBinds')}
      </p>
      <LegalMarkdown source={source} />
    </article>
  )
}
