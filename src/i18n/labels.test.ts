import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/**
 * Accessible names come from the catalogs, like every other piece of text.
 *
 * Two fields carried `aria-label="Titel"` and `aria-label="Dauer"` in every
 * language: an English reader heard "Titel", a French one "Dauer". Nobody saw
 * it, because the visible text around them was translated all along -- a label
 * only a screen reader reads is a label only a screen reader can catch.
 */

const hardCoded = execFileSync(
  'git',
  ['grep', '--untracked', '-n', '-E', 'aria-label="[^"]', '--', 'src'],
  { encoding: 'utf8' },
)
  .split('\n')
  .filter((line) => line !== '' && !line.includes('.test.'))

describe('accessible names', () => {
  it('are never written into the markup', () => {
    // A test file may hard-code one: that is the expectation, not the product.
    expect(hardCoded).toEqual([])
  })
})
