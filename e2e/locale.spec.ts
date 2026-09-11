import { expect, test } from '@playwright/test'

/**
 * That the language actually resolves, from the outside.
 *
 * This project runs with locale en-US and no storage state, which is the only
 * combination that exercises the Accept-Language leg -- the one a first-time
 * visitor with no account and no cookie arrives on. Every other project pins
 * de-DE, so nothing else in the suite would notice if that leg broke.
 *
 * Asserted in a browser rather than against resolveLocale() because the unit
 * test already covers the rule. What can only fail here is the wiring: whether
 * the header reaches getRequestConfig, and whether the resolved locale reaches
 * the <html> element.
 */

test('a visitor with no session and no cookie gets their browser language', async ({ page }) => {
  await page.goto('/login')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('the switcher works before there is an account to remember it', async ({ page }) => {
  await page.goto('/login')

  // The switcher is a plain form on purpose -- it has to work on the one screen
  // a visitor reaches before hydration, and before they have a session.
  await page.getByLabel(/language|sprache|langue|idioma/i).selectOption('fr')
  await page.getByRole('button', { name: /appliquer|apply|übernehmen|aplicar/i }).click()

  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')

  // The cookie, not just the response to the POST: a reload is what proves the
  // choice outlived the request that made it.
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr')
})
