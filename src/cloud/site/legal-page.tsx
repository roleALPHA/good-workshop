import { getLocale, getTranslations } from 'next-intl/server'
import { LegalMarkdown } from '@/cloud/legal/markdown'
import { readLegalDocument, type LegalDocument } from '@/cloud/legal/documents'

/** One legal text. German only, with a note saying so in every other language. */
export async function LegalPage({ document }: { document: LegalDocument }) {
  const [source, locale, t] = await Promise.all([
    readLegalDocument(document),
    getLocale(),
    getTranslations('site.legal'),
  ])

  return (
    <article lang="de" className="max-w-3xl">
      {locale !== 'de' && (
        <p lang={locale} className="mb-6 text-[14px] text-[var(--fg-muted)]">
          {t('germanOnly')}
        </p>
      )}
      <LegalMarkdown source={source} />
    </article>
  )
}
