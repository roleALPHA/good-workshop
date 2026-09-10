import { expect, test, type Page } from '@playwright/test'

/** Waits for the shared document to be connected before touching it. */
const connected = (page: Page) =>
  expect(page.getByRole('region', { name: /^Agenda/ })).toHaveAttribute('data-save-state', 'live')

/**
 * Reloads until the assertion holds.
 *
 * Edits reach the tables through the collaboration server on a debounce, so a
 * single reload can be a moment too early. Retrying the reload is honest about
 * that; a fixed sleep would only hide how long it actually takes.
 */
async function reloadUntil(page: Page, assertion: () => Promise<void>) {
  // Waits for the socket buffer to drain first. Reloading with bytes still
  // queued loses them -- a real user-facing risk, not merely a test-timing
  // problem, which is why the editor reports that state at all.
  await connected(page)

  await expect(async () => {
    await page.reload()
    await assertion()
  }).toPass({ timeout: 15_000 })
}

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
  await connected(page)
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

  await reloadUntil(page, async () => {
    await expect(page.getByRole('article', { name: 'Gruppenarbeit' })).toBeVisible()
  })
})

test('persists a renamed block', async ({ page }) => {
  await addBlock(page, 'Gruppenarbeit')

  const title = page.getByRole('article', { name: 'Gruppenarbeit' }).getByLabel('Titel')
  await title.fill('Aufwärmen im Plenum')
  await page.keyboard.press('Tab')

  await reloadUntil(page, async () => {
    await expect(page.getByRole('article', { name: 'Aufwärmen im Plenum' })).toBeVisible()
  })
})

test('carries a duration change to a second browser, and the times with it', async ({
  page,
  context,
}) => {
  await addBlock(page, 'Gruppenarbeit')
  await addBlock(page, 'Pause')
  await expect(page.getByRole('article', { name: 'Pause' })).toContainText('09:45')

  // A second window on the same day. This is what live collaboration actually
  // is, and it proves the change left the browser without a reload -- which is
  // its own race, and a worse test for the same behaviour.
  const other = await context.newPage()
  await other.goto(page.url())
  await connected(other)
  await expect(other.getByRole('article', { name: 'Gruppenarbeit' })).toBeVisible()

  const duration = page.getByRole('article', { name: 'Gruppenarbeit' }).getByLabel('Dauer')
  await duration.fill('1h15')
  await page.keyboard.press('Tab')

  // Read back in canonical form: "1h15" goes in, "1h15m" comes out, and both
  // parse to the same 75 minutes.
  await expect(
    other.getByRole('article', { name: 'Gruppenarbeit' }).getByLabel('Dauer'),
  ).toHaveValue('1h15m')
  // And the derived times move for the other person too, without either side
  // recomputing anything.
  await expect(other.getByRole('article', { name: 'Pause' })).toContainText('10:15')

  await other.close()
})

test('shows a block one person adds to everyone else', async ({ page, context }) => {
  const other = await context.newPage()
  await other.goto(page.url())
  await connected(other)

  await addBlock(page, 'Energizer')

  await expect(other.getByRole('article', { name: 'Energizer' })).toBeVisible()
  await other.close()
})

test('persists a type-specific field edited inside the row', async ({ page }) => {
  await addBlock(page, 'Gruppenarbeit')

  const row = page.getByRole('article', { name: 'Gruppenarbeit' })
  await row.getByRole('button', { name: /Mehr Felder/ }).click()
  await row.getByLabel('Ergebnis').fill('Ein Flipchart je Gruppe')
  await page.keyboard.press('Tab')

  await reloadUntil(page, async () => {
    await page
      .getByRole('article', { name: 'Gruppenarbeit' })
      .getByRole('button', { name: /Mehr Felder/ })
      .click()
    await expect(page.getByLabel('Ergebnis')).toHaveValue('Ein Flipchart je Gruppe')
  })
})

test('exports the day as Markdown', async ({ page }) => {
  await addBlock(page, 'Gruppenarbeit')

  const url = (await page.getByRole('link', { name: 'Markdown' }).getAttribute('href'))!

  // Retried, because the export reads the relational tables and those trail
  // the live document by a moment -- that lag is the deliberate consequence of
  // Yjs being the editing layer and Postgres the record.
  await expect(async () => {
    // Fetched from inside the page rather than through page.request: the two do
    // not share a cookie jar in the way one would assume, and the browser's own
    // fetch is what a user's download actually looks like.
    const result = await page.evaluate(async (href) => {
      const response = await fetch(href, { credentials: 'same-origin' })
      return { type: response.headers.get('content-type') ?? '', body: await response.text() }
    }, url)

    expect(result.type).toContain('text/markdown')
    expect(result.body).toContain(workshopTitle)
    expect(result.body).toContain('Gruppenarbeit')
    expect(result.body).toContain('GoodWorkshop · powered by roleALPHA')
    // Thirty seconds, not fifteen: the very first materialisation after the
    // collaboration server starts is markedly slower than every later one --
    // steady state is under two seconds. The cause is not fully pinned down,
    // so the budget is generous rather than the assertion weakened.
  }).toPass({ timeout: 30_000 })
})

test('renders a printable day without any editor JavaScript', async ({ page }) => {
  await addBlock(page, 'Gruppenarbeit')

  const url = (await page.getByRole('link', { name: 'Drucken' }).getAttribute('href'))!

  // Same lag as the export: the print view renders from the tables.
  await expect(async () => {
    await page.goto(url)
    await expect(page.getByRole('heading', { name: workshopTitle })).toBeVisible()
    await expect(page.getByText('Gruppenarbeit')).toBeVisible()
  }).toPass({ timeout: 30_000 })
  // No drag handles, no inputs: what comes out of the printer must match what
  // was on screen, and a hydration pass would reflow it mid-dialog.
  await expect(page.getByRole('button', { name: /verschieben$/ })).toHaveCount(0)
  await expect(page.getByLabel('Dauer')).toHaveCount(0)
})
