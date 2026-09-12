import type { Locale } from './config'
import type messages from '@/messages/de.json'

/**
 * Tells next-intl what this application's locales and messages actually are.
 *
 * Without it `useLocale()` and `getLocale()` return a bare `string`, which then
 * has to be cast at every call site that cares -- and a cast is a place a wrong
 * value gets in. With it, `formatTime(minute, useLocale())` typechecks because
 * the locale is one of four, and a fifth would be a compile error.
 *
 * `Messages` is declared off the German catalog for the same reason
 * `createMessagesDeclaration` points there in next.config.ts: German is the
 * source text, so a key that exists in German is a key that must exist
 * everywhere -- and src/i18n/catalogs.test.ts enforces the other direction.
 */
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: typeof messages
    Formats: {
      dateTime: { short: object }
    }
  }
}
