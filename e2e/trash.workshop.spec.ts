import { expect, test } from '@playwright/test'

/**
 * Throwing a workshop away and getting it back, through the actual buttons.
 *
 * Presence in the library is asserted through the per-workshop bin button,
 * whose aria-label carries the title on its own. The row's link is one anchor
 * around title, tags, day count and status, so its accessible name is all of
 * them joined -- a locator on the title alone quietly matched nothing, and
 * "expected 0" passed for the wrong reason.
 *
 * The rules live in domain/workshop/delete.db.test.ts; what this adds is that
 * the buttons are wired to them -- including the one guard that only exists in
 * the browser: the bin refuses to purge until the title has been typed out.
 */

test('moves a workshop to the bin, brings it back, and only then ends it', async ({ page }) => {
  const title = `Wegwerf ${Date.now()}`

  await page.goto('/library')
  await page.getByRole('button', { name: 'Neuer Workshop' }).click()
  await page.getByLabel('Titel des Workshops').fill(title)
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()

  await page.goto('/library')
  const inLibrary = page.getByRole('button', { name: `${title} in den Papierkorb` })
  await inLibrary.click()

  // Gone from the library, and findable in the bin.
  await expect(inLibrary).toHaveCount(0)
  await page.goto('/library/trash')
  // Scoped to OUR row. The bin holds whatever earlier runs left behind, and
  // `.first()` cheerfully restored somebody else's workshop while this test
  // waited for its own to come back.
  const row = page.getByRole('listitem').filter({ hasText: title })
  await expect(row).toHaveCount(1)

  await row.getByRole('button', { name: 'Wiederherstellen' }).click()
  // The row leaving the bin is the signal that the action finished: the click
  // starts a transition, so navigating straight away races it and lands on a
  // library page rendered before the restore was written.
  await expect(row).toHaveCount(0)
  await page.goto('/library')
  await expect(inLibrary).toBeVisible()

  // And once more, this time for good. Waited on again -- the transition has to
  // finish before the bin will have anything to show.
  await inLibrary.click()
  await expect(inLibrary).toHaveCount(0)
  await page.goto('/library/trash')
  const again = page.getByRole('listitem').filter({ hasText: title })
  await again.getByRole('button', { name: 'Endgültig löschen' }).click()

  // The guard: typing the title is the difference between confirming and
  // reading, and the button stays dead until it matches.
  const confirm = again.getByRole('button', { name: 'Unwiderruflich löschen' })
  await expect(confirm).toBeDisabled()
  await again.getByLabel('Zum Bestätigen den Titel eingeben:').fill(title)
  await expect(confirm).toBeEnabled()
  await confirm.click()

  await expect(again).toHaveCount(0)
  await page.goto('/library')
  await expect(inLibrary).toHaveCount(0)
})
