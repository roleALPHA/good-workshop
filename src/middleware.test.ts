import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from './middleware'

/**
 * The security headers that were not there.
 *
 * The Caddyfile states that "the application sets its own headers; the proxy
 * only adds HSTS". It does not. Before this file, the single place in the tree
 * that set a security header was the logo route -- which does it exactly right,
 * and is one endpoint.
 *
 * Clickjacking needs no XSS to work, and /admin/members, /admin/branding and
 * /settings/tokens put role changes, invitations and token creation behind
 * ordinary buttons. That is the finding; CSP is the second line behind it.
 */

const headersFor = (path = '/w/abc') => {
  const response = middleware(new NextRequest(new URL(`https://ws.example.com${path}`)))
  return response.headers
}

describe('security headers', () => {
  it.each([
    { header: 'x-content-type-options', expected: /nosniff/ },
    {
      header: 'referrer-policy',
      expected: /strict-origin-when-cross-origin|same-origin|no-referrer/,
    },
    { header: 'strict-transport-security', expected: /max-age=\d+/ },
    { header: 'permissions-policy', expected: /publickey-credentials-get/ },
    { header: 'content-security-policy', expected: /default-src/ },
  ])('sets $header', ({ header, expected }) => {
    expect(headersFor().get(header) ?? '').toMatch(expected)
  })

  it('refuses to be framed', () => {
    const csp = headersFor().get('content-security-policy') ?? ''
    expect(csp).toMatch(/frame-ancestors 'none'/)
  })

  it('locks down where forms may post and what <base> may rewrite', () => {
    const csp = headersFor().get('content-security-policy') ?? ''
    expect(csp).toMatch(/form-action 'self'/)
    expect(csp).toMatch(/base-uri 'self'/)
  })

  it('carries a nonce instead of blanket-allowing inline script', () => {
    // The assertion that matters: an injected <script> has no nonce, so it
    // does not run. 'unsafe-inline' would make that untrue.
    const csp = headersFor().get('content-security-policy') ?? ''
    const scriptSrc = csp.split('; ').find((d) => d.startsWith('script-src')) ?? ''

    expect(scriptSrc).toMatch(/'nonce-[A-Za-z0-9+/_-]{16,}'/)
    expect(scriptSrc).not.toMatch(/'unsafe-inline'/)
  })

  it('documents the eval exception rather than hiding it', () => {
    // This test asserts a WEAKNESS on purpose, so that removing it is a
    // deliberate act with a red test to prove it worked.
    //
    // Ajv compiles a module type's JSON Schema with `new Function` in the
    // browser, and the schemas are tenant-defined, so precompiling them is not
    // available. Dropping 'unsafe-eval' without replacing Ajv makes every
    // field edit throw and silently lose the edit -- which is how this was
    // found, in the E2E suite, after the unit tests were green.
    const scriptSrc = (headersFor().get('content-security-policy') ?? '')
      .split('; ')
      .find((d) => d.startsWith('script-src'))

    expect(scriptSrc).toContain("'unsafe-eval'")
  })

  it('allows inline style, and only inline style', () => {
    // Asserted rather than left implicit, because it is the one concession in
    // this policy. Next inlines styles of its own while streaming and the
    // tenant brand ramp is an inline <style>; a nonce cannot be threaded
    // through Next's style emission reliably. The residual risk is CSS
    // injection, not script execution.
    //
    // The test exists so that the concession stays exactly this wide: if
    // 'unsafe-inline' ever appears in script-src, the test above fails.
    const csp = headersFor().get('content-security-policy') ?? ''
    const withUnsafeInline = csp
      .split('; ')
      .filter((d) => d.includes("'unsafe-inline'"))
      .map((d) => d.split(' ')[0])

    expect(withUnsafeInline).toEqual(['style-src'])
  })

  it('shuts the doors that need no exception at all', () => {
    const csp = headersFor().get('content-security-policy') ?? ''
    expect(csp).toMatch(/object-src 'none'/)
    expect(csp).toMatch(/default-src 'self'/)
  })

  it('gives every response its own nonce', () => {
    // A fixed nonce is a fixed password: reuse across responses and it stops
    // distinguishing the server's script from an injected one.
    const first = headersFor().get('content-security-policy')
    const second = headersFor().get('content-security-policy')
    expect(first).not.toBe(second)
  })

  it('passes the nonce to the renderer', () => {
    // The header alone would block the app's own inline styles; the value has
    // to reach React, which reads it from this request header.
    const response = middleware(new NextRequest(new URL('https://ws.example.com/')))
    const forwarded = response.headers.get('x-nonce') ?? ''
    expect(response.headers.get('content-security-policy')).toContain(forwarded)
    expect(forwarded).not.toBe('')
  })
})
