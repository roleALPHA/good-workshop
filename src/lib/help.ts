/**
 * The help pages: one site for both editions, in the four languages the app
 * speaks, each under its own prefix. Its source is help/ in this repository.
 */
export const HELP_SITE = 'https://doc.goodworkshop.org'

export function helpUrl(locale: string): string {
  return `${HELP_SITE}/${locale}/`
}
