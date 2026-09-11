import { describe, expect, it } from 'vitest'
import { icuShape } from './icu'

const args = (m: string) => [...icuShape(m).args].sort()

describe('icuShape', () => {
  it('finds a plain argument', () => {
    expect(args('Hallo {name}, schön dich zu sehen.')).toEqual(['name'])
  })

  it('finds a typed argument without walking into its format', () => {
    expect(args('Zuletzt {when, date, short}')).toEqual(['when'])
  })

  /**
   * The case the naive regex gets wrong, and the reason this file exists:
   * `one {Tag}` is an arm body, not an argument called "Tag".
   */
  it('does not mistake single-word plural arms for arguments', () => {
    expect(args('{count, plural, one {Tag} other {Tage}}')).toEqual(['count'])
    expect(args('{count, plural, one {day} other {days}}')).toEqual(['count'])
  })

  it('still finds arguments nested inside an arm', () => {
    expect(args('{count, plural, one {ein {thing}} other {# {thing}}}')).toEqual(['count', 'thing'])
  })

  it('does not mistake select arms for arguments either', () => {
    expect(args('{theme, select, light {hell} dark {dunkel} other {}}')).toEqual(['theme'])
  })

  it('reports plural categories, and only for plural-shaped arguments', () => {
    const shape = icuShape('{count, plural, one {#} other {#}}')
    expect([...(shape.plurals.get('count') ?? [])].sort()).toEqual(['one', 'other'])

    expect(icuShape('{theme, select, light {a} other {b}}').plurals.size).toBe(0)
  })

  it('ignores an offset modifier rather than reading it as a category', () => {
    const shape = icuShape('{n, plural, offset:1 one {#} other {#}}')
    expect([...(shape.plurals.get('n') ?? [])].sort()).toEqual(['one', 'other'])
  })

  it('respects ICU quoting', () => {
    expect(args("Ein '{'literal'}' und {echt}")).toEqual(['echt'])
    expect(args("Zwei Apostrophe '' und {echt}")).toEqual(['echt'])
  })

  /**
   * A bare apostrophe is not a quote. French messages are full of them, and a
   * parser that opens a quoted run on `L'` eats the rest of the sentence --
   * arguments included -- and then reports every French plural and placeholder
   * as a mismatch.
   */
  it('treats a bare apostrophe as text, not as an escape', () => {
    expect(args("L'atelier a été modifié (attendu {expected}, trouvé {actual}).")).toEqual([
      'actual',
      'expected',
    ])
    expect(args("doit être l'une de ces valeurs : {allowed}")).toEqual(['allowed'])
  })

  it('never throws on a half-written message', () => {
    for (const broken of ['{', '{}', '{,}', '{count, plural,', 'a {b', '{{}}']) {
      expect(() => icuShape(broken)).not.toThrow()
    }
  })
})
