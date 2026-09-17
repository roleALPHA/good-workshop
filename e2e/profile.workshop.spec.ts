import { expect, test } from '@playwright/test'

/**
 * The profile menu and the profile itself, end to end.
 *
 * The component test holds the menu's behaviour; this holds that it is wired
 * to real pages, that a name saved in the profile is the one the header shows,
 * and that the addresses the settings pages used to have still lead somewhere.
 */

test.describe.configure({ mode: 'serial' })

test('reaches every account page through the menu, on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/library')

  const menu = page.getByRole('button', { name: 'Konto', exact: true })
  await menu.click()
  // The signed-in e2e user is the tenant admin, so the administration is there.
  await expect(page.getByRole('navigation', { name: 'Verwaltung' })).toBeVisible()
  await page.getByRole('link', { name: 'KI-Verbindung' }).click()
  await expect(page).toHaveURL(/\/settings\/ai-connection$/)
  await expect(page.getByRole('heading', { level: 1, name: 'KI-Verbindung' })).toBeVisible()

  await menu.click()
  await page.getByRole('link', { name: 'Sicherheit' }).click()
  await expect(page).toHaveURL(/\/settings\/security$/)

  await menu.click()
  await page.getByRole('link', { name: 'Mitglieder' }).click()
  await expect(page).toHaveURL(/\/admin\/members$/)

  // Nothing wider than the phone.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(overflow).toBe(false)
})

test('keeps the old settings addresses working', async ({ page }) => {
  await page.goto('/settings/tokens')
  await expect(page).toHaveURL(/\/settings\/ai-connection$/)
  await page.goto('/settings/passkeys')
  await expect(page).toHaveURL(/\/settings\/security$/)
})

test('shows the name saved in the profile in the header', async ({ page }) => {
  await page.goto('/settings')
  const first = page.getByLabel('Vorname')
  const last = page.getByLabel('Nachname')

  await first.fill('Erika')
  await last.fill(`Ende ${Date.now() % 1000}`)
  const expected = `Erika ${await last.inputValue()}`
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByRole('status')).toHaveText('Gespeichert.')

  await page.reload()
  await expect(page.getByRole('button', { name: 'Konto', exact: true })).toHaveAttribute(
    'title',
    expected,
  )

  // Put back what e2e/auth.setup.ts gave the account, for the tests that follow.
  await page.getByLabel('Nachname').fill('Ende')
  await page.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByRole('status')).toHaveText('Gespeichert.')
})
