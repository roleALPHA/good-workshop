// Every page in all four languages, at the same path, with the frontmatter the
// site needs. The language picker links to the same path in another language;
// a page missing there is a dead link that no link checker sees, because
// Starlight quietly falls back to the German page.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const LOCALES = ['de', 'en', 'fr', 'es']
const root = new URL('../src/content/docs/', import.meta.url).pathname

function pages(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return pages(path)
    return /\.mdx?$/.test(name) ? [path] : []
  })
}

const byLocale = Object.fromEntries(
  LOCALES.map((locale) => {
    const dir = join(root, locale)
    return [locale, new Set(pages(dir).map((p) => relative(dir, p)))]
  }),
)

const problems = []
const all = new Set(LOCALES.flatMap((l) => [...byLocale[l]]))
for (const page of [...all].sort()) {
  for (const locale of LOCALES) {
    if (!byLocale[locale].has(page)) {
      problems.push(
        `${locale}/${page}: missing (exists in ${LOCALES.filter((l) => byLocale[l].has(page)).join(', ')})`,
      )
      continue
    }
    const text = readFileSync(join(root, locale, page), 'utf8')
    const front = /^---\n([\s\S]*?)\n---/.exec(text)?.[1] ?? ''
    for (const key of ['title', 'description']) {
      if (!new RegExp(`^${key}:\\s*\\S`, 'm').test(front))
        problems.push(`${locale}/${page}: no ${key}`)
    }
    if (!page.startsWith('index.') && !/^sidebar:\s*\n\s+order:\s*\d+/m.test(front)) {
      problems.push(`${locale}/${page}: no sidebar.order`)
    }
  }
}

if (problems.length > 0) {
  console.error(`\n  HELP PAGES OUT OF STEP\n\n  ${problems.join('\n  ')}\n`)
  process.exit(1)
}
console.log(`${all.size} pages in ${LOCALES.length} languages.`)
