import { NextResponse, type NextRequest } from 'next/server'
import { localeForPath } from '@/cloud/site/routes'

/**
 * The response headers the Caddyfile claimed the application was already
 * setting. It was not: before this file, the single place in the tree that set
 * a security header was the tenant logo route -- one endpoint, doing it
 * exactly right, while every HTML response went out bare.
 *
 * The one that matters without any other bug being present is
 * `frame-ancestors`. Clickjacking needs no XSS, and /admin/members,
 * /admin/branding and /settings/ai-connection put role changes, invitations and token
 * creation behind ordinary buttons.
 *
 * A note on `style-src`, because it is the one place this policy is not strict
 * and that should be visible rather than buried:
 *
 *   script-src carries a per-response nonce and no 'unsafe-inline'. That is
 *   the half that stops injected script. It does carry 'unsafe-eval', for the
 *   reason documented at the directive itself.
 *
 *   style-src keeps 'unsafe-inline'. Next inlines styles of its own during
 *   streaming, and the tenant brand ramp is an inline <style> whose content is
 *   server-computed numbers. The residual risk is CSS injection -- defacement
 *   and, with some effort, coarse data inference through selectors. Buying the
 *   strict version would mean threading a nonce through Next's own style
 *   emission, which it does not reliably support. Worth revisiting; not worth
 *   claiming to have solved.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = crypto.randomUUID().replaceAll('-', '')

  const csp = [
    "default-src 'self'",
    // 'unsafe-eval' is here for one reason, found by the E2E suite rather than
    // by reasoning: Ajv compiles a module type's JSON Schema with
    // `new Function`, in the browser, and the schemas are tenant-defined so
    // they cannot be precompiled at build time. Without it the field editor
    // throws on every commit and the edit is lost.
    //
    // It is not free. It re-opens eval, which an attacker who already controls
    // a string reaching eval could use. What it does NOT re-open is the main
    // event: injected <script> still needs the per-response nonce, because
    // 'unsafe-inline' is absent.
    //
    // Removing it means replacing Ajv in the browser with an interpreting
    // validator. Worth doing -- and cheaper now than it was: the browser check
    // is no longer the only one. Every edit reaches the tables through
    // materializeDay, which validates each block's desc against its module
    // type on the way in (see validatedDescs there), so what the browser does
    // here is instant feedback rather than the guarantee. Replacing it can
    // therefore be judged on ergonomics alone.
    `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`,
    "style-src 'self' 'unsafe-inline'",
    // data: for the tenant logo, which is served from the row as a data URI in
    // some paths; blob: for nothing yet, so it stays out.
    "img-src 'self' data:",
    "font-src 'self'",
    // The collaboration socket runs on the same host under /collab, but a
    // separate GW_COLLAB_URL is a supported deployment, so ws: and wss: to self
    // are allowed rather than pinned to a value this file cannot see.
    "connect-src 'self' ws: wss:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'upgrade-insecure-requests',
  ].join('; ')

  // The nonce travels to the renderer on the REQUEST, which is where Next
  // looks for it; it is also echoed on the response so the value is assertable
  // and so a proxy can correlate the two.
  const headers = new Headers(request.headers)
  headers.set('x-nonce', nonce)

  /**
   * The public website's language, read out of the address.
   *
   * It has to happen here because this is the only place that sees the
   * pathname before the tree renders, and `<html lang>` is written by the root
   * layout -- above every page that could otherwise have set it. The header
   * travels the same way the nonce does and is picked up in
   * src/i18n/request.ts; for everything behind the login `localeForPath`
   * returns null, nothing is set, and the language comes from the person as
   * before. In a community build those paths are not routes at all, so the
   * table matches nothing but `/`, which only ever redirects.
   */
  // Always set, empty where the address names no language, and that is not
  // tidiness. Next forwards only the headers it was told to override; a
  // `headers.delete()` here is not communicated, so a client that sends an
  // `x-locale` of its own would have it reach the renderer untouched on every
  // path the table does not match -- which is the whole application behind the
  // login. Writing an empty value overwrites it, and an empty value resolves
  // to "no signal" in src/i18n/resolve.ts.
  headers.set('x-locale', localeForPath(request.nextUrl.pathname) ?? '')
  // The address itself, for the one thing in the tree that needs to know which
  // page it is on without being told: the language switcher of the public
  // website, which offers this page in the other three languages and therefore
  // has to build their addresses. Set unconditionally for the same reason as
  // x-locale above.
  headers.set('x-pathname', request.nextUrl.pathname)

  const response = NextResponse.next({ request: { headers } })

  response.headers.set('content-security-policy', csp)
  response.headers.set('x-nonce', nonce)
  // The language is resolved from the session, the gw_locale cookie and
  // Accept-Language (src/i18n/request.ts), so the same URL legitimately has
  // four different bodies. Caddy is a proxy and caches nothing, but the moment
  // anyone puts a CDN in front of an install, a German page served to a French
  // visitor is the bug -- and it is the kind nobody reproduces.
  response.headers.set('vary', 'accept-language, cookie')
  response.headers.set('x-content-type-options', 'nosniff')
  response.headers.set('referrer-policy', 'strict-origin-when-cross-origin')
  // Belt and braces next to frame-ancestors: still honoured by older browsers
  // that ignore the CSP directive.
  response.headers.set('x-frame-options', 'DENY')
  // publickey-credentials-get is named explicitly because this application is
  // passwordless -- a policy that silently dropped it would disable every
  // passkey login.
  response.headers.set(
    'permissions-policy',
    'camera=(), microphone=(), geolocation=(), payment=(), usb=(), publickey-credentials-get=(self)',
  )
  // Set here as well as in the proxy: the `tls` compose profile is optional,
  // and an install that terminates TLS somewhere else was getting no HSTS at
  // all. Harmless over plain http, where browsers ignore it.
  response.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains')

  return response
}

export const config = {
  // Everything except Next's own static output. The API routes are included on
  // purpose: nosniff and frame-ancestors matter for the export endpoint too.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
