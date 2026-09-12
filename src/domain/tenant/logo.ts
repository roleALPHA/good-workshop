/**
 * Tenant logo handling.
 *
 * The one deliberate exception to "attachments are URLs, never blobs". It is
 * tolerable because the logo is small, hard-capped and exactly one row per
 * tenant -- so `pg_dump` stays a complete backup of the whole application,
 * which is a selling point worth protecting rather than a coincidence.
 */

import { DomainError } from '@/domain/errors'

export const MAX_LOGO_BYTES = 256 * 1024

export const LOGO_TYPES = ['image/svg+xml', 'image/png', 'image/webp'] as const
export type LogoType = (typeof LOGO_TYPES)[number]

export class LogoError extends DomainError {}

/**
 * Things an SVG must not contain.
 *
 * The upload is REFUSED rather than cleaned. Cleaning markup with patterns is
 * how sanitisers get bypassed: a near-miss leaves a file that passed the check
 * and still runs. Refusing has no such failure mode -- the worst case is a
 * designer being told to export without scripting, which is a sentence they
 * can act on.
 *
 * Belt and braces: the logo is only ever served into an `<img>`, and browsers
 * do not execute script in an SVG loaded that way. This check is the braces.
 */
/**
 * The third element is the message key; the second names the construct inside
 * it.
 *
 * That construct stays as markup (`<script>`, `on…=`) rather than becoming
 * prose. It is code: it reads the same to a French admin as to a German one,
 * and a translated paraphrase would be less precise rather than more.
 */
type ForbiddenKey = 'logo.unsafeActive' | 'logo.unsafeExternal' | 'logo.unsafeDoctype'

const FORBIDDEN: [RegExp, string, ForbiddenKey][] = [
  [/<\s*script/i, '<script>', 'logo.unsafeActive'],
  [/<\s*foreignObject/i, '<foreignObject>', 'logo.unsafeActive'],
  // Can pull in a remote stylesheet with @import, which is a request to a
  // third party from inside somebody's private installation.
  [/<\s*style/i, '<style>', 'logo.unsafeActive'],
  [/<\s*(iframe|embed|object)/i, '<iframe>/<embed>/<object>', 'logo.unsafeActive'],
  [/\son[a-z]+\s*=/i, 'on…=', 'logo.unsafeActive'],
  [/javascript\s*:/i, 'javascript:', 'logo.unsafeActive'],
  // Local references (#gradient) are fine and common; anything reaching out is
  // a request to another server every time the page is opened.
  //
  // Unquoted attribute values count. The first version of this pattern
  // required a quote before the scheme, so `<use href=data:image/svg+xml,...>`
  // walked straight past it -- and unquoted attributes are perfectly ordinary
  // HTML-ish markup that browsers accept without complaint.
  [/(?:xlink:)?href\s*=\s*(?:["'](?!#)[^"']*:|(?!["'#])[^\s>]*:)/i, 'href', 'logo.unsafeExternal'],
  // Entities are a way to write anything at all somewhere else in the document
  // and have the parser assemble it here, which defeats every pattern above.
  // A logo has no legitimate use for a DTD.
  [/<!DOCTYPE/i, '<!DOCTYPE>', 'logo.unsafeDoctype'],
  [/<!ENTITY/i, '<!ENTITY>', 'logo.unsafeDoctype'],
]

export type Logo = { data: string; mime: LogoType }

/**
 * Checks an upload and returns what to store.
 *
 * A tenant admin's upload is untrusted input like any other. It arrives from
 * somebody with a lot of authority in their own tenant -- and none at all over
 * everybody else's browsers.
 */
export function readLogo(bytes: Uint8Array, mime: string): Logo {
  if (!LOGO_TYPES.includes(mime as LogoType)) {
    throw new LogoError('logo.unsupportedType')
  }
  if (bytes.byteLength === 0) throw new LogoError('logo.empty')
  if (bytes.byteLength > MAX_LOGO_BYTES) {
    throw new LogoError('logo.tooLarge', {
      max: Math.round(MAX_LOGO_BYTES / 1024),
      actual: Math.round(bytes.byteLength / 1024),
    })
  }

  if (mime === 'image/svg+xml') {
    const text = new TextDecoder().decode(bytes)
    // Checked at the front of the file, not anywhere in it. Raster formats are
    // verified by signature; SVG used to be matched with a regex against
    // content the client also labelled, so a file could open with anything at
    // all -- a GIF header, say -- and still pass because an <svg> appeared
    // further down. The declared type is the client's claim, and the file is
    // served back under it.
    if (!/^\s*(?:<\?xml[^>]*>\s*)?<\s*svg[\s>]/i.test(text)) {
      throw new LogoError('logo.notSvg')
    }

    for (const [pattern, what, key] of FORBIDDEN) {
      if (pattern.test(text)) throw new LogoError(key, { what })
    }
  } else if (!looksLikeRaster(bytes, mime)) {
    // The declared type is the client's claim; the first bytes are the file's
    // own answer. Storing a mislabelled file means serving it mislabelled too.
    throw new LogoError('logo.typeMismatch')
  }

  return { data: Buffer.from(bytes).toString('base64'), mime: mime as LogoType }
}

function looksLikeRaster(bytes: Uint8Array, mime: string): boolean {
  if (mime === 'image/png') {
    return (
      bytes.length > 8 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    )
  }
  // WebP: "RIFF" .... "WEBP"
  return (
    bytes.length > 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  )
}
