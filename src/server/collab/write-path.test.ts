import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * One day has one write path.
 *
 * The collaboration room's document is what the materialiser writes back to the
 * tables, deleting every block the document does not hold. So a second writer
 * -- a server action, a repository function, an MCP tool reaching past the room
 * -- has its row removed again a few seconds later, silently, and only when
 * somebody happened to have that day open. That is the worst possible shape for
 * a bug, and it is why every agenda mutation goes through the room.
 *
 * `tsc` cannot see this and neither can a review of one file: the rule is about
 * which modules exist, so the test reads the sources. It cost us a whole second
 * write path that was dead for months and would have been reached again by the
 * next person looking for "where do I save a block".
 */
describe('the blocks of a day', () => {
  const root = join(__dirname, '..', '..')

  /** Only the materialiser. Reads are free; this is about writes. */
  const WRITER = 'server/collab/materialize.ts'

  const TABLES = ['workshopModule', 'workshopCluster']
  const WRITES = ['insert', 'update', 'delete']

  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) return sources(path)
      return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : []
    })

  /** `tx.insert(workshopModule)` and friends, wherever the chain starts. */
  const writesTo = (file: ts.SourceFile): { table: string; line: number }[] => {
    const found: { table: string; line: number }[] = []

    const visit = (node: ts.Node): void => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        WRITES.includes(node.expression.name.text) &&
        node.arguments.length === 1
      ) {
        const argument = node.arguments[0]
        if (argument !== undefined && ts.isIdentifier(argument) && TABLES.includes(argument.text)) {
          found.push({
            table: argument.text,
            line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1,
          })
        }
      }
      ts.forEachChild(node, visit)
    }

    visit(file)
    return found
  }

  const writers = sources(root).flatMap((path) => {
    const file = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true)
    const where = relative(root, path)
    return writesTo(file).map(({ table, line }) => ({ where, table, line }))
  })

  it('is written by the materialiser and by nothing else', () => {
    const strangers = writers
      .filter(({ where }) => where !== WRITER)
      .map(({ where, table, line }) => `${where}:${line} writes ${table}`)
    expect(strangers).toEqual([])
  })

  /** A guard that matches nothing guards nothing. */
  it('is written by the materialiser', () => {
    expect(writers.filter(({ where }) => where === WRITER).length).toBeGreaterThan(0)
  })
})
