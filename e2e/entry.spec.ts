import { expect, test } from '@playwright/test'

/**
 * Where the bare address leads.
 *
 * `/` used to render an agenda preview, from the months when there was no
 * database to send anybody to. Once an install has accounts, somebody typing
 * the hostname wants to get in -- and a preview that looks like the product but
 * saves nothing is the worst of both. It is gone; what it proved is proved in
 * component tests and against a real workshop now.
 *
 * Asserted from the outside, in a browser, because this is exactly the kind of
 * wiring that typechecks perfectly while going nowhere.
 */

test('sends a visitor without a session somewhere they can act', async ({ page }) => {
  await page.goto('/')

  // Two destinations are correct, and which one depends on the state of the
  // installation: an unclaimed one offers /setup, everything else /login.
  // Pinning this to /login made the test a statement about the fixture data
  // rather than about the redirect.
  await expect(page).toHaveURL(/\/(login|setup)$/)

  // Not merely the URL: a redirect chain that ends on an error page would
  // satisfy that and still leave nobody able to get in.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})
