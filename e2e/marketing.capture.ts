import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { seedReferenceDay } from './fixtures/seed-day'

/**
 * The pictures on the website, taken from the running product.
 *
 * Against a throwaway database, so no test leftovers end up in a picture:
 *
 *   dropdb goodworkshop_shots; createdb goodworkshop_shots
 *   export DATABASE_URL=... OPS_DATABASE_URL=... MIGRATION_DATABASE_URL=... ADMIN_DATABASE_URL=...
 *   pnpm db:bootstrap && pnpm db:migrate && pnpm db:provision && pnpm capture
 *
 * Not part of the suite: it writes files, and a screenshot that changes on
 * every run would make every pull request look like a design change. It runs
 * when somebody asks for it:
 *
 *   pnpm capture
 *
 * What it captures is the seeded reference day -- the same agenda the tests
 * assert on. A marketing picture of something the tests do not cover is a
 * picture of a screen nobody is watching.
 */

const OUT = join(process.cwd(), 'public', 'marketing')
const capture = Boolean(process.env.GW_CAPTURE)

/**
 * The fixture is a skeleton: real titles and times, no content. A picture of it
 * shows an empty product, which is a fair picture of an empty day and an unfair
 * one of the product -- so the day gets what a prepared day has.
 */
async function furnish(page: Page) {
  const content: [string, string, string][] = [
    ['Check-in & Start', 'Jede Person in einem Satz: Womit komme ich heute rein?', 'Mara Wolf'],
    [
      'Agenda & Spielregeln',
      'Ablauf, Ziel des Tages, und die drei Regeln für die Diskussion.',
      'Mara Wolf',
    ],
    [
      'Energizer: Zwei Wahrheiten',
      'Zwei Wahrheiten, eine Lüge. Zwei Runden, dann weiter im Programm.',
      'Jonas Feld',
    ],
  ]

  for (const [block, description, responsible] of content) {
    const row = page.getByRole('article', { name: block })
    if (!(await row.count())) continue

    const field = row.getByLabel('Beschreibung')
    if (await field.count()) {
      await field.fill(description)
      await field.blur()
    }

    const add = row.getByLabel('Verantwortliche Person hinzufügen')
    if (await add.count()) {
      await add.click()
      await page.keyboard.type(responsible)
      await page.keyboard.press('Enter')
      await page.keyboard.press('Escape')
    }
  }
}

/** Nothing half-drawn: fonts loaded, images decoded, animations finished. */
async function settle(page: Page) {
  // Nothing focused, nothing half-open: an editor caught mid-edit reads as a
  // glitch in a picture.
  await page.keyboard.press('Escape')
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  // Back to the top: filling fields scrolls, and a picture that starts in the
  // middle of a list shows no product, only rows.
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(300)
}

test.describe('marketing pictures', () => {
  test.skip(!capture, 'Runs on request: GW_CAPTURE=1 pnpm capture')

  test.beforeAll(async () => {
    await mkdir(OUT, { recursive: true })
  })

  /**
   * The library needs more than one workshop to look like a library, and its
   * own folders -- a picture of somebody else's test data is not a picture of
   * this product.
   */
  test('the library', async ({ page, request }) => {
    for (const [folder, workshops] of [
      ['Kundenprojekte', ['Kickoff Neukunde', 'Retrospektive Q3']],
      ['Interne Formate', ['Onboarding Tag 1']],
    ] as const) {
      await page.goto('/library')
      await page.getByRole('button', { name: 'Ordner', exact: true }).first().click()
      await page.getByLabel('Name des Ordners').fill(folder)
      await page.keyboard.press('Enter')
      await expect(page.getByRole('link', { name: folder, exact: true }).first()).toBeVisible()

      for (const workshop of workshops) {
        await seedReferenceDay(page, request, workshop)
        await page.goto('/library')
        // `.first()`: a database that has seen a previous run carries the same
        // names again, and the picture only needs one of each.
        await page
          .getByRole('button', { name: `${workshop} in einen Ordner verschieben` })
          .first()
          .click()
        await page.getByLabel('Verschieben nach').last().selectOption({ label: folder })
        await expect(page.getByText(`in ${folder}`).first()).toBeVisible()
      }
    }

    await page.setViewportSize({ width: 1280, height: 860 })
    await page.goto('/library')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await settle(page)

    await page.screenshot({ path: join(OUT, 'library.png') })
  })

  test('a workshop day', async ({ page, request }) => {
    await seedReferenceDay(page, request, 'Strategie-Workshop Q4')
    await furnish(page)
    await page.setViewportSize({ width: 1280, height: 860 })
    await expect(page.getByRole('region', { name: /^Agenda/ })).toBeVisible()
    await settle(page)

    await page.screenshot({ path: join(OUT, 'agenda.png') })
  })

  test('the reading view on a phone', async ({ page, request }) => {
    // The screen a facilitator actually holds in the room.
    await seedReferenceDay(page, request, 'Teamtag: Neues Zielbild')
    await furnish(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await settle(page)
    // Past the page's own header and the category legend: what this picture is
    // about is the day as cards, in a hand.
    await page.getByRole('article', { name: 'Check-in & Start' }).scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollBy(0, -80))
    await page.waitForTimeout(200)

    await page.screenshot({ path: join(OUT, 'phone.png') })
  })
})
