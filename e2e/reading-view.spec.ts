import { expect, test } from '@playwright/test'
import { seedReferenceDay } from './fixtures/seed-day'

/**
 * The phone reading view is not a degraded desktop table -- it is the screen a
 * facilitator actually uses on the day, standing in the room. These assertions
 * are the mechanical half of the checklist in docs/konventionen-ui.md.
 *
 * Every one of them is about layout -- overflow, font size, cards instead of a
 * grid, a pinned section header -- so they stayed here when the derivations
 * moved into component tests. jsdom has no layout engine to ask.
 *
 * They run against a real, seeded workshop now. The public demo page that used
 * to serve them is gone: it looked like the product and saved nothing.
 */

test.describe('reading view on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'Phone layout only')

  test.beforeEach(async ({ page, request }) => {
    await seedReferenceDay(page, request)
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
    const duration = await row.getByText('10m').first().boundingBox()

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

  test('does not boot the editor at all', async ({ page }) => {
    // Not a feature withheld from phones: nested drag & drop plus rich text on
    // a 375px screen is the wrong tool for the screen. No handles means no
    // dnd-kit, no ProseMirror, nothing to hydrate.
    await expect(page.getByRole('button', { name: /verschieben$/ })).toHaveCount(0)
  })

  test('shows the attribution footer here too', async ({ page }) => {
    await expect(page.getByText('GoodWorkshop · powered by roleALPHA')).toBeVisible()
  })
})

test.describe('editor gating', () => {
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
