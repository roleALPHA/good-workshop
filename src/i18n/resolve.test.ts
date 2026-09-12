import { describe, expect, it } from 'vitest'
import { asLocale, negotiate, resolveLocale } from './resolve'

/**
 * Every wrong answer here renders a perfectly readable page in the wrong
 * language -- no error, no failed request, nothing else to notice it by. So the
 * precedence rule is asserted as a table rather than by example.
 */

describe('resolveLocale', () => {
  it('prefers the signed-in person over everything else', () => {
    expect(resolveLocale({ user: 'fr', cookie: 'es', acceptLanguage: 'en-US' })).toBe('fr')
  })

  it('falls to the cookie when there is no session', () => {
    expect(resolveLocale({ cookie: 'es', acceptLanguage: 'en-US' })).toBe('es')
  })

  it('falls to the browser when there is no cookie either', () => {
    expect(resolveLocale({ acceptLanguage: 'en-US,en;q=0.9' })).toBe('en')
  })

  it('falls to German when nothing is known', () => {
    expect(resolveLocale({})).toBe('de')
  })

  /**
   * identity.locale is `text not null default 'de'` with no check constraint,
   * and the column is a documented seam for OIDC/SAML imports. A value an
   * external IdP wrote must not be able to take the page down, and must not
   * swallow the next source either.
   */
  it.each(['de-AT', '', 'klingon', 'DE', null, undefined, 42, {}])(
    'ignores an unusable identity.locale (%p) and keeps looking',
    (user) => {
      expect(resolveLocale({ user: user as string, cookie: 'fr' })).toBe('fr')
    },
  )

  it('ignores an unusable cookie the same way', () => {
    expect(resolveLocale({ cookie: 'xx', acceptLanguage: 'es-ES' })).toBe('es')
  })
})

describe('negotiate', () => {
  it('drops the region subtag -- an Austrian browser wants German, not English', () => {
    expect(negotiate('de-AT')).toBe('de')
    expect(negotiate('de-CH,de;q=0.9,en;q=0.8')).toBe('de')
  })

  it('respects q-values over header order', () => {
    expect(negotiate('en;q=0.3, fr;q=0.9')).toBe('fr')
  })

  it('keeps header order when qualities tie', () => {
    expect(negotiate('es, fr')).toBe('es')
  })

  it('skips languages it has no catalog for', () => {
    expect(negotiate('ja, ko;q=0.9, fr;q=0.5')).toBe('fr')
  })

  it('treats q=0 as a refusal, not a preference', () => {
    expect(negotiate('de;q=0, fr;q=0.5')).toBe('fr')
  })

  it('returns null for a wildcard, so the default wins rather than the first locale', () => {
    expect(negotiate('*')).toBeNull()
  })

  it.each([null, undefined, '', '   ', ';;;', 'de;q=notanumber'])(
    'never throws on a malformed header (%p)',
    (header) => {
      expect(() => negotiate(header)).not.toThrow()
    },
  )

  it('still reads a language whose q-value is garbage', () => {
    // The weight is unparseable; the tag is not. `fr;q=abc` says the visitor
    // reads French, and losing that to a typo would be the worse answer.
    expect(negotiate('fr;q=abc')).toBe('fr')
    // Treated as q=1, so it ties with `es` and header order decides.
    expect(negotiate('fr;q=abc, es')).toBe('fr')
  })
})

describe('asLocale', () => {
  it('accepts exactly the four supported languages', () => {
    expect(asLocale('de')).toBe('de')
    expect(asLocale('en')).toBe('en')
    expect(asLocale('fr')).toBe('fr')
    expect(asLocale('es')).toBe('es')
  })

  it('rejects anything else', () => {
    expect(asLocale('it')).toBeNull()
    expect(asLocale('en-GB')).toBeNull()
  })
})
