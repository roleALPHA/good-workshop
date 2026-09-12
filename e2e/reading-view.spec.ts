import { expect, test, type Page } from '@playwright/test'
import { seedReferenceDay } from './fixtures/seed-day'
import { STORAGE_STATE } from './paths'

/**
 * The phone is not a degraded desktop table -- it is the screen a facilitator
 * actually uses on the day, standing in the room. These assertions are the
 * mechanical half of the checklist in docs/ui-conventions.md.
 *
 * Every one of them is about layout -- overflow, font size, cards instead of a
 * grid, a pinned section header -- so they stayed here when the derivations
 * moved into component tests. jsdom has no layout engine to ask.
 *
 * The editor used to be withheld here. It is not any more: a facilitator in a
 * room changes the social form, adds a material and nails a block to a clock
 * time, and all three are a tap. What the old gate protected is protected where
 * it belongs -- dragging takes a long press, so the page still scrolls under a
 * finger, and every field is 16px so iOS does not zoom when one is focused.
 */

/**
 * The read-only table paints first -- that is the point of it, the agenda is
 * legible before any JavaScript has arrived -- and the editor replaces it once
 * the browser has taken over.
 *
 * So every assertion below has to wait for that swap, and two kinds of call in
 * Playwright do NOT wait on their own: `page.evaluate`, and `boundingBox()` on
 * a locator that does not match yet. Both answered about the table on CI and
 * about the editor on a fast laptop, which is exactly the sort of test that
 * passes locally and fails in the pipeline.
 */
const editorReady = (page: Page) =>
  expect(page.getByRole('article', { name: 'Check-in & Start' }).getByLabel('Titel')).toBeVisible()

test.describe('the day view on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'Phone layout only')

  // Seeded once for the whole file: every assertion below READS, so one agenda
  // serves them all -- and the MCP endpoint is not asked for a workshop eight
  // times in a row. The one test that writes seeds its own day, so it cannot
  // change what the others are looking at.
  let dayUrl: string

  test.beforeAll(async ({ browser, playwright, baseURL }) => {
    const context = await browser.newContext({ storageState: STORAGE_STATE })
    const page = await context.newPage()
    const request = await playwright.request.newContext({ baseURL, storageState: STORAGE_STATE })
    dayUrl = await seedReferenceDay(page, request)
    await request.dispose()
    await context.close()
  })

  test.beforeEach(async ({ page }) => {
    await page.goto(dayUrl)
    await editorReady(page)
  })

  test('never scrolls horizontally', async ({ page }) => {
    const overflow = await page.evaluate(() => {
      const el = document.documentElement
      return el.scrollWidth - el.clientWidth
    })
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('keeps body text at 16px so iOS does not zoom on focus', async ({ page }) => {
    const size = await page.evaluate(() => parseFloat(getComputedStyle(document.body).fontSize))
    expect(size).toBeGreaterThanOrEqual(16)
  })

  test('collapses the table into cards instead of a scrolling grid', async ({ page }) => {
    // The desktop column headers are a table affordance; a card layout labels
    // itself, so they must not be on screen.
    await expect(page.getByText('Titel und Beschreibung')).toBeHidden()
    await expect(page.getByRole('heading', { name: 'Check-in & Start' })).toBeVisible()
  })

  test('puts start time and duration on one line', async ({ page }) => {
    const row = page.getByRole('article', { name: 'Agenda & Spielregeln' })
    const start = await row.getByText('13:15').boundingBox()
    // The duration is an input here, not text: the row is editable.
    const duration = await row.getByLabel('Dauer').boundingBox()

    expect(start).not.toBeNull()
    expect(duration).not.toBeNull()
    // Same visual line: vertical centres within a few pixels of each other.
    const startCentre = start!.y + start!.height / 2
    const durationCentre = duration!.y + duration!.height / 2
    expect(Math.abs(startCentre - durationCentre)).toBeLessThan(6)
  })

  test('keeps the current section header pinned while scrolling through it', async ({ page }) => {
    const header = page.getByRole('group', { name: 'Ankommen & Rahmen' })

    // Scroll just past the header's own position -- far enough that it has to
    // stick, close enough that we are still inside its section and the next
    // section's header has not pushed it out yet.
    const box = await header.boundingBox()
    expect(box).not.toBeNull()
    await page.evaluate((delta) => window.scrollBy(0, delta), box!.y + 120)

    await expect(async () => {
      const stuck = await header.boundingBox()
      expect(stuck).not.toBeNull()
      expect(stuck!.y).toBeLessThan(4)
    }).toPass()
  })

  test('can be edited, which is the whole reason a facilitator opens it here', async ({ page }) => {
    const row = page.getByRole('article', { name: 'Check-in & Start' })

    await expect(row.getByLabel('Titel')).toBeVisible()
    await expect(row.getByLabel('Dauer')).toBeVisible()
    await expect(row.getByRole('button', { name: /^Sozialform:/ })).toBeVisible()
    await expect(row.getByLabel('Material hinzufügen')).toBeVisible()
  })

  test('never puts a field below 16px, or iOS zooms the page when it is focused', async ({
    page,
  }) => {
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll('article input, article textarea')].map((el) =>
        parseFloat(getComputedStyle(el).fontSize),
      ),
    )
    expect(sizes.length).toBeGreaterThan(0)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(16)
  })

  test('needs a long press to drag, so a swipe still scrolls the page', async ({ page }) => {
    const handle = page.getByRole('button', { name: 'Check-in & Start verschieben' })
    const box = (await handle.boundingBox())!

    // A quick swipe across the handle: with a 200ms activation delay this is a
    // scroll, not a drag. If dragging activated on contact, the page could not
    // be scrolled by touching a row at all.
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2)

    // Our own live region, not dnd-kit's: both carry role="status", and the
    // announcements this product makes are the ones assembled in the editor.
    await expect(page.getByRole('region', { name: /^Agenda/ }).getByRole('status')).toHaveText('')
  })

  test('shows the attribution footer here too', async ({ page }) => {
    const footer = page.getByRole('contentinfo')
    await expect(footer).toContainText('GoodWorkshop · powered by roleALPHA')
    await expect(footer.getByRole('link', { name: 'roleALPHA' })).toHaveAttribute(
      'href',
      'https://rolealpha.com',
    )
    await expect(footer.getByRole('link', { name: 'AGPL-3.0' })).toHaveAttribute(
      'href',
      'https://github.com/roleALPHA/good-workshop',
    )
  })

  /**
   * Declared last on purpose: it is the only test in this file that WRITES, and
   * the rest share one seeded day. Going last means it can use that day instead
   * of seeding a second one -- which matters, because the MCP endpoint is rate
   * limited and the full suite already seeds once per test in agenda.spec.ts.
   * A test that needs its own fixture would have to earn it.
   */
  test('keeps a change made here, rather than showing it and losing it', async ({ page }) => {
    const row = page.getByRole('article', { name: 'Check-in & Start' })

    await row.getByRole('button', { name: /^Sozialform:/ }).tap()
    await page.getByRole('option', { name: 'Paare' }).tap()
    await expect(row.getByRole('button', { name: 'Sozialform: Paare' })).toBeVisible()

    await page.reload()
    await editorReady(page)
    await expect(
      page.getByRole('article', { name: 'Check-in & Start' }).getByRole('button', {
        name: 'Sozialform: Paare',
      }),
    ).toBeVisible()
  })
})

test.describe('the wide screen', () => {
  test.skip(({ isMobile }) => isMobile === true, 'Desktop layout only')

  test('shows the agenda table with its column headers on a wide screen', async ({
    page,
    request,
  }) => {
    await seedReferenceDay(page, request)
    await expect(page.getByText('Titel und Beschreibung')).toBeVisible()
    await expect(page.getByText('Zusatzinfo')).toBeVisible()
  })
})
