import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * Every `var(--token)` in the tree resolves to a token that exists.
 *
 * A misspelt custom property is invisible: CSS drops the declaration and the
 * element renders with no background at all, which looks like a design choice
 * until somebody notices. That is exactly how three buttons shipped with
 * `--brand-600`, a token this project never had -- the real one is `--brand`.
 *
 * The sibling rule about raw hex colours is enforced by ESLint; this is its
 * other half, and it belongs in a test because it is a question about the whole
 * tree rather than about one file.
 */

const CSS_FILES = ['src/styles/globals.css', 'src/styles/print.css']

/**
 * Declarations, from two places.
 *
 * The stylesheets, including inside @media and [data-theme] -- and inline
 * styles in components, which is how a per-peer hue or a column count reaches
 * one element without a class for every value.
 */
function definedTokens(): Set<string> {
  const defined = new Set<string>()

  for (const file of CSS_FILES) {
    for (const match of readFileSync(file, 'utf8').matchAll(/(--[a-z0-9-]+)\s*:/gi)) {
      defined.add(match[1]!)
    }
  }

  const inline = execFileSync(
    'git',
    ['grep', '--untracked', '-hoE', "'--[a-z0-9-]+':", '--', 'src'],
    { encoding: 'utf8' },
  )
  for (const match of inline.matchAll(/'(--[a-z0-9-]+)':/g)) defined.add(match[1]!)

  return defined
}

/** Uses: `var(--name)` in components, styles and anything else tracked. */
function usedTokens(): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const grep = execFileSync(
    'git',
    ['grep', '--untracked', '-noE', 'var\\(--[a-z0-9-]+', '--', 'src'],
    { encoding: 'utf8' },
  )

  for (const line of grep.split('\n').filter(Boolean)) {
    const match = /^(.+?):(\d+):var\((--[a-z0-9-]+)$/.exec(line)
    if (!match) continue
    // This file names tokens in prose and in its own patterns; checking itself
    // would report `--token` as missing forever.
    if (match[1]?.endsWith('tokens.test.ts')) continue
    const [, file, lineNo, token] = match
    const where = `${file}:${lineNo}`
    const seen = out.get(token!)
    if (seen) seen.push(where)
    else out.set(token!, [where])
  }
  return out
}

describe('CSS custom properties', () => {
  it('are all defined somewhere before they are used', () => {
    const defined = definedTokens()

    const missing = [...usedTokens().entries()]
      .filter(([token]) => !defined.has(token))
      .map(([token, where]) => `${token} (${where.slice(0, 3).join(', ')})`)

    expect(missing, 'undefinierte Farbtoken').toEqual([])
  })
})
