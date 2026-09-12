import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'
import { CATALOGS } from '@/i18n/catalogs'
import { DEFAULT_LOCALE } from '@/i18n/config'

/**
 * `render`, with the real message catalog behind it.
 *
 * Not a mock: these components call `useTranslations`, and a stub would make
 * the assertions statements about the stub. German is the source text, so a
 * test rendered this way asserts exactly the strings it asserted before the
 * catalog existed -- the diff in each test file is the import and the render
 * call, and nothing else.
 *
 * The time zone is pinned for the same reason src/i18n/request.ts pins one: a
 * date formatted against the machine's zone passes on a laptop in Berlin and
 * fails in CI.
 */
export function renderWithIntl(ui: ReactElement, options?: RenderOptions): RenderResult {
  return render(ui, {
    wrapper: ({ children }) => (
      <NextIntlClientProvider
        locale={DEFAULT_LOCALE}
        messages={CATALOGS[DEFAULT_LOCALE]}
        timeZone="Europe/Berlin"
      >
        {children}
      </NextIntlClientProvider>
    ),
    ...options,
  })
}
