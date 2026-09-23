import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * What a `'use server'` file is allowed to export.
 *
 * Next turns every export of such a file into a callable endpoint, so it
 * accepts async functions and nothing else. One constant is enough to make the
 * module throw `invalid-use-server-value` when it is EVALUATED -- and it is
 * evaluated when an action is CALLED, not when a page is rendered. So the
 * screens keep answering 200 and every button on them answers 500.
 *
 * That is how the operator console lost both its doors in v0.6.1: a
 * `export const ISSUABLE_SCOPES = OPERATOR_SCOPES` that nobody imported. The
 * sign-in page rendered, the passkey button and the mail link did not work, and
 * nothing in between said why.
 *
 * Nothing else catches it. `tsc` cannot -- it is a rule of Next's, not a type
 * error -- and the build writes the route file either way, so `test -e` in CI
 * stays green. Hence a test, reading the source rather than the types, because
 * that is where the rule lives.
 *
 * Type-only exports are fine: they are gone by the time Next looks.
 */
describe("a 'use server' file", () => {
  const root = join(__dirname, '..')

  const sources = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) return sources(path)
      return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : []
    })

  /** The directive counts only as the first statement -- anywhere else it is just a string. */
  const isUseServer = (file: ts.SourceFile) => {
    const first = file.statements[0]
    return (
      first !== undefined &&
      ts.isExpressionStatement(first) &&
      ts.isStringLiteral(first.expression) &&
      first.expression.text === 'use server'
    )
  }

  const exported = (node: ts.Statement) =>
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) === true

  /** Why this export is not allowed, or null when it is. */
  const complaint = (node: ts.Statement): string | null => {
    if (ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node)) return null
    if (ts.isFunctionDeclaration(node)) {
      const async = ts.getModifiers(node)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
      return async ? null : `${node.name?.text ?? '(anonymous)'} is not async`
    }
    if (ts.isVariableStatement(node)) {
      const names = node.declarationList.declarations
        .map((d) => (ts.isIdentifier(d.name) ? d.name.text : '(destructured)'))
        .join(', ')
      return `${names} is a value, not an async function`
    }
    if (ts.isClassDeclaration(node)) return `${node.name?.text ?? '(anonymous)'} is a class`
    return 'is not an async function'
  }

  const offenders = sources(root).flatMap((path) => {
    const source = readFileSync(path, 'utf8')
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
    if (!isUseServer(file)) return []

    return file.statements.flatMap((node) => {
      // `export { … }` and `export default` carry no modifier of their own.
      const bad = ts.isExportDeclaration(node)
        ? 're-exports; name each action with `export async function` instead'
        : ts.isExportAssignment(node)
          ? 'exports a default'
          : exported(node)
            ? complaint(node)
            : null
      if (bad === null) return []

      const { line } = file.getLineAndCharacterOfPosition(node.getStart(file))
      return [`${relative(root, path)}:${line + 1} — ${bad}`]
    })
  })

  it('exports async functions and types, and nothing else', () => {
    expect(offenders).toEqual([])
  })

  /** A guard that matches nothing guards nothing. */
  it('finds the files it is meant to check', () => {
    const found = sources(root).filter((path) =>
      isUseServer(
        ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true),
      ),
    )
    expect(found.length).toBeGreaterThan(10)
  })
})
