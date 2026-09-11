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
    // 'unsafe-inline' would make the whole policy decorative, and this app has
    // real inline content: next-themes, and the tenant brand <style> block.
    const csp = headersFor().get('content-security-policy') ?? ''
    expect(csp).toMatch(/'nonce-[A-Za-z0-9+/_-]{16,}'/)
    expect(csp).not.toMatch(/'unsafe-inline'/)
    expect(csp).not.toMatch(/'unsafe-eval'/)
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
