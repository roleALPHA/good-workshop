import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * The legal texts, by the path they are published under.
 *
 * Markdown files next to this one, so that whoever reviews them edits text and
 * not code. They are read from disk at request time; next.config.ts lists them
 * in `outputFileTracingIncludes` for a cloud build, which is what puts them into
 * the standalone output and therefore into the image.
 */
export const LEGAL_DOCUMENTS = ['impressum', 'agb', 'widerruf', 'datenschutz', 'avv'] as const
export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number]

export async function readLegalDocument(document: LegalDocument): Promise<string> {
  return readFile(join(process.cwd(), 'src', 'cloud', 'legal', `${document}.md`), 'utf8')
}
