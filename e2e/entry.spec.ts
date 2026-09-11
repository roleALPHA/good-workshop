import { expect, test } from '@playwright/test'

/**
 * Where the bare address leads.
 *
 * `/` used to render the agenda preview, from the months when there was no
 * database to send anybody to. Once an install has accounts, somebody typing
 * the hostname wants to get in -- and a preview that looks like the product but
 * saves nothing is the worst of both. The preview kept its content at `/demo`,
 * which is also what the tests above this one exercise.
 *
 * Asserted from the outside, in a browser, because this is exactly the kind of
 * wiring that typechecks perfectly while going nowhere.
 */

test('sends a visitor without a session to the login page', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
  // Not merely the URL: a redirect chain that ends on an error page would
  // satisfy that and still leave nobody able to sign in.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
})

test('keeps the agenda preview reachable without an account', async ({ page }) => {
  await page.goto('/demo')
  await expect(page).toHaveURL(/\/demo$/)
  await expect(page.getByRole('region', { name: /^Agenda/ })).toBeVisible()
})
