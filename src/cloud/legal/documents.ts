import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config'

/**
 * The legal texts, by the path they are published under.
 *
 * Markdown files next to this one, so that whoever reviews them edits text and
 * not code. They are read from disk at request time; next.config.ts lists them
 * in `outputFileTracingIncludes` for a cloud build, which is what puts them into
 * the standalone output and therefore into the image.
 */
export const LEGAL_DOCUMENTS = ['impressum', 'agb', 'datenschutz', 'avv'] as const
export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number]

/**
 * One legal text, in a language.
 *
 * German has no suffix and the translations do (`agb.md`, `agb.en.md`), which
 * is not only a naming convention: the German file is the binding one, and a
 * reader of this directory should be able to see that without being told.
 * A missing translation falls back to it rather than to nothing.
 */
export async function readLegalDocument(
  document: LegalDocument,
  locale: Locale = DEFAULT_LOCALE,
): Promise<{ source: string; locale: Locale }> {
  const dir = join(process.cwd(), 'src', 'cloud', 'legal')
  if (locale !== DEFAULT_LOCALE) {
    try {
      return { source: await readFile(join(dir, `${document}.${locale}.md`), 'utf8'), locale }
    } catch {
      // A text nobody has translated yet is shown in German, with the note the
      // page already carries. Better than a page that is not there.
    }
  }
  return { source: await readFile(join(dir, `${document}.md`), 'utf8'), locale: DEFAULT_LOCALE }
}

/**
 * Which month a `Stand:` line names. Jänner as well as Januar: the texts are
 * Austrian, the word is not settled, and a version that fails to parse because
 * somebody wrote the other one would be a silly way to break a registration.
 */
const MONTHS: readonly (readonly string[])[] = [
  ['Januar', 'Jänner'],
  ['Februar', 'Feber'],
  ['März'],
  ['April'],
  ['Mai'],
  ['Juni'],
  ['Juli'],
  ['August'],
  ['September'],
  ['Oktober'],
  ['November'],
  ['Dezember'],
]

/**
 * The version of a legal text: the date of its `Stand:` line, as YYYY-MM-DD.
 *
 * The line the reader sees is the version, rather than a number kept beside it
 * in code. A second copy is a copy that goes stale, and this one would go stale
 * in the direction that matters: the record would name a version nobody ever
 * published. What is stored with a consent has to be findable in the published
 * text, and this is the only string in it that says which text it is.
 */
export function documentVersion(markdown: string): string {
  const line = markdown.match(/^\s*Stand:\s*(\d{1,2})\.\s*([^\s]+)\s+(\d{4})\s*$/m)
  if (!line) throw new Error('legal document has no "Stand:" line to take a version from')
  // The groups exist because the pattern matched; the same shortcut the
  // billing code takes when it splits a month key.
  const [, day, month, year] = line as unknown as [string, string, string, string]
  const index = MONTHS.findIndex((names) => names.includes(month))
  if (index < 0) throw new Error(`legal document names an unknown month: ${month}`)
  return `${year}-${String(index + 1).padStart(2, '0')}-${day.padStart(2, '0')}`
}

/**
 * The version of a document, always the German one.
 *
 * A consent is recorded against the binding text, whatever language it was read
 * in -- so a translation that is a day behind does not create a second version
 * that nobody could ever find in the terms.
 */
export async function readLegalVersion(document: LegalDocument): Promise<string> {
  return documentVersion((await readLegalDocument(document)).source)
}
