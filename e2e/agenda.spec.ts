import { expect, test, type Page } from '@playwright/test'

/**
 * What this file adds over the unit tests: proof that the whole pipeline
 * survives a real browser. flattenDay -> computeSchedule -> withGapRows ->
 * AgendaTable is exercised in Vitest; here we check that the server-rendered
 * result is actually readable, that the OKLCH token system resolves, and that
 * state conveyed visually is also in the accessibility tree.
 *
 * Blocks are queried as `article` named by their title and sections as `group`
 * named by theirs -- not by test ids, and not as generic list items, which
 * would collide with the bullet lists inside descriptions.
 *
 * Flows still to be added as their features land (see
 * .claude/skills/goodworkshop-testing/SKILL.md): magic-link login, creating a
 * workshop, drag & drop by mouse and by keyboard, setting a pin in the UI,
 * Markdown export, and the 409 conflict banner across two browser contexts.
 */

const block = (page: Page, name: string) => page.getByRole('article', { name })
const section = (page: Page, name: string) => page.getByRole('group', { name })
const agenda = (page: Page) => page.getByRole('region', { name: /^Agenda/ })

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('renders the day in agenda order with computed start times', async ({ page }) => {
  // 13:00 is pinned; everything after it is derived from durations alone.
  await expect(block(page, 'Check-in & Start')).toContainText('13:00')
  await expect(block(page, 'Agenda & Spielregeln')).toContainText('13:15')
  await expect(block(page, 'Energizer: Zwei Wahrheiten')).toContainText('13:25')
  await expect(block(page, 'Druckpunkte')).toContainText('13:35')

  const titles = await page.getByRole('heading', { level: 3 }).allInnerTexts()
  expect(titles.slice(0, 4)).toEqual([
    'Check-in & Start',
    'Agenda & Spielregeln',
    'Energizer: Zwei Wahrheiten',
    'Druckpunkte',
  ])
})

test('announces a pinned start time instead of signalling it with an icon alone', async ({
  page,
}) => {
  await expect(block(page, 'Check-in & Start').getByText('Startzeit fixiert:')).toBeAttached()
  await expect(block(page, 'Agenda & Spielregeln').getByText('Startzeit fixiert:')).toHaveCount(0)
})

test('states an overlap in words rather than silently shortening a block', async ({ page }) => {
  const lunch = block(page, 'Mittagessen')

  await expect(lunch).toContainText('14:30')
  await expect(lunch).toContainText('Überschneidet den vorherigen Block um 30m')

  // The block above keeps its full duration -- the conflict is surfaced, not resolved.
  await expect(block(page, 'Einwandintegration')).toContainText('10m')
})

test('derives a cluster duration from its children', async ({ page }) => {
  // 15 + 10 + 10 = 35, and it starts where its first (pinned) child starts.
  await expect(section(page, 'Ankommen & Rahmen')).toContainText('3 Blöcke · 35m')
  await expect(section(page, 'Ankommen & Rahmen')).toContainText('13:00')
})

test('shows the running end time and flags going over plan', async ({ page }) => {
  // Scoped to the agenda: 17:30 also appears in the header summary above it.
  await expect(agenda(page).getByText('17:30')).toBeVisible()
  await expect(agenda(page).getByText('Ende', { exact: true })).toBeVisible()
  await expect(agenda(page).getByText('30m über Plan')).toBeVisible()
})

test('carries the attribution footer on every view', async ({ page }) => {
  await expect(page.getByText('GoodWorkshop · powered by roleALPHA')).toBeVisible()
})

test('never scrolls horizontally', async ({ page }) => {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement
    return el.scrollWidth - el.clientWidth
  })
  expect(overflow).toBeLessThanOrEqual(0)
})

test('follows the system colour scheme through the token system', async ({ page }) => {
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor)

  await page.emulateMedia({ colorScheme: 'light' })
  const light = await bg()

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(async () => expect(await bg()).not.toBe(light)).toPass()

  // Category bars must stay defined in dark mode -- that is the whole point of
  // redefining the .cat-* tokens instead of only flipping the page background.
  const barColour = await block(page, 'Check-in & Start').evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--cat-bar').trim(),
  )
  expect(barColour).not.toBe('')
})
