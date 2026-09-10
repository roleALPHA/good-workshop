import { expect, test, type Page } from '@playwright/test'

/** Waits for the write to actually land before doing anything that could race it. */
const saved = (page: Page) =>
  expect(page.getByRole('region', { name: /^Agenda/ })).toHaveAttribute('data-save-state', 'saved')

/**
 * The authenticated path, against a real database.
 *
 * These tests earn the right to say the editor persists anything. Everything
 * the public-demo suite covers happens in memory; here a reload is the
 * assertion, because a reload is what a user does when they are not sure it
 * saved.
 */

let workshopTitle: string

test.beforeEach(async ({ page }) => {
  workshopTitle = `Test ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  await page.goto('/library')
  await page.getByRole('button', { name: 'Neuer Workshop' }).click()
  await page.getByLabel('Titel des Workshops').fill(workshopTitle)
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click()

  // Straight into the new workshop: a freshly created plan you then have to
  // find in a list is a step nobody wants.
  await expect(page.getByRole('heading', { name: workshopTitle })).toBeVisible()
})

async function addBlock(page: Page, typeName: string) {
  await page.getByRole('button', { name: 'Block hinzufügen' }).click()
  await page.getByLabel('Blocktyp suchen').fill(typeName)
  await page
    .getByRole('button', { name: new RegExp(typeName) })
    .first()
    .click()
  await expect(page.getByRole('article', { name: typeName })).toBeVisible()
}

test('creates a workshop with its first day already in place', async ({ page }) => {
  // A workshop without a day is a dead end -- nothing to open, nothing to plan.
  await expect(page.getByText('ZEIT')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Block hinzufügen' })).toBeVisible()
})

test('adds a block and keeps it after a reload', async ({ page }) => {
  await addBlock(page, 'Gruppenarbeit')

  await page.reload()
  await expect(page.getByRole('article', { name: 'Gruppenarbeit' })).toBeVisible()
})

test('persists a renamed block', async ({ page }) => {
  await addBlock(page, 'Gruppenarbeit')

  const title = page.getByRole('article', { name: 'Gruppenarbeit' }).getByLabel('Titel')
  await title.fill('Aufwärmen im Plenum')
  await page.keyboard.press('Tab')
  await saved(page)

  await page.reload()
  await expect(page.getByRole('article', { name: 'Aufwärmen im Plenum' })).toBeVisible()
})

test('persists a duration and the times it shifts', async ({ page }) => {
  await addBlock(page, 'Gruppenarbeit')
  await addBlock(page, 'Pause')

  await expect(page.getByRole('article', { name: 'Pause' })).toContainText('09:45')

  const duration = page.getByRole('article', { name: 'Gruppenarbeit' }).getByLabel('Dauer')
  await duration.fill('1h15')
  await page.keyboard.press('Tab')
  await expect(page.getByRole('article', { name: 'Pause' })).toContainText('10:15')
  await saved(page)

  await page.reload()
  // Read back in canonical form: "1h15" goes in, "1h15m" comes out, and both
  // parse to the same 75 minutes.
  await expect(
    page.getByRole('article', { name: 'Gruppenarbeit' }).getByLabel('Dauer'),
  ).toHaveValue('1h15m')
  await expect(page.getByRole('article', { name: 'Pause' })).toContainText('10:15')
})

test('persists a type-specific field edited inside the row', async ({ page }) => {
  await addBlock(page, 'Gruppenarbeit')

  const row = page.getByRole('article', { name: 'Gruppenarbeit' })
  await row.getByRole('button', { name: /Mehr Felder/ }).click()
  await row.getByLabel('Ergebnis').fill('Ein Flipchart je Gruppe')
  await page.keyboard.press('Tab')
  await saved(page)

  await page.reload()
  await page
    .getByRole('article', { name: 'Gruppenarbeit' })
    .getByRole('button', { name: /Mehr Felder/ })
    .click()
  await expect(page.getByLabel('Ergebnis')).toHaveValue('Ein Flipchart je Gruppe')
})

test('exports the day as Markdown', async ({ page }) => {
  await addBlock(page, 'Gruppenarbeit')

  const url = (await page.getByRole('link', { name: 'Markdown' }).getAttribute('href'))!

  // Fetched from inside the page rather than through page.request: the two do
  // not share a cookie jar in the way one would assume, and the browser's own
  // fetch is what a user's download actually looks like.
  const result = await page.evaluate(async (href) => {
    const response = await fetch(href, { credentials: 'same-origin' })
    return { type: response.headers.get('content-type') ?? '', body: await response.text() }
  }, url)

  expect(result.type).toContain('text/markdown')
  const body = result.body
  expect(body).toContain(workshopTitle)
  expect(body).toContain('Gruppenarbeit')
  expect(body).toContain('GoodWorkshop · powered by roleALPHA')
})

test('renders a printable day without any editor JavaScript', async ({ page }) => {
  await addBlock(page, 'Gruppenarbeit')

  const url = (await page.getByRole('link', { name: 'Drucken' }).getAttribute('href'))!
  await page.goto(url)

  await expect(page.getByRole('heading', { name: workshopTitle })).toBeVisible()
  // No drag handles, no inputs: what comes out of the printer must match what
  // was on screen, and a hydration pass would reflow it mid-dialog.
  await expect(page.getByRole('button', { name: /verschieben$/ })).toHaveCount(0)
  await expect(page.getByLabel('Dauer')).toHaveCount(0)
})
