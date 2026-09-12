import { expect, test } from '@playwright/test'

/**
 * First-run setup, end to end.
 *
 * Runs in the `desktop`/`mobile` projects, which carry no session -- which is
 * the whole point: this is the one screen an installation shows to somebody who
 * cannot log in yet, because nobody can.
 *
 * It asserts the closed door rather than the happy path. Claiming the
 * installation would leave an admin behind for every other test in the suite,
 * and the happy path has its own coverage against a real database in
 * server/settings/setup.db.test.ts.
 */

test('refuses to hand out the installation without the setup key', async ({ page }) => {
  const response = await page.goto('/setup')

  // An installation that already has an admin -- which is the state the test
  // database is in -- must not show this form at all.
  if (page.url().includes('/login')) {
    expect(response?.status()).toBeLessThan(400)
    return
  }

  await page.getByLabel('Deine E-Mail-Adresse').fill('eindringling@example.test')
  await page.getByLabel('Einrichtungsschlüssel').fill('geraten')
  await page.getByRole('button', { name: 'Installation einrichten' }).click()

  // Not by role: Next's route announcer is also role="alert", and two matches
  // are a failure in strict mode rather than a statement.
  await expect(page.getByText('Der Einrichtungsschlüssel stimmt nicht.')).toBeVisible()
})
