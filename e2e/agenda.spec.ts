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
 * docs/konventionen-tests.md): magic-link login, creating a
 * workshop, setting a pin in the UI, Markdown export, and the 409 conflict
 * banner across two browser contexts.
 */

const block = (page: Page, name: string) => page.getByRole('article', { name })
const section_ = (page: Page, name: string) => page.getByRole('group', { name })
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

  // Asserted on accessible names rather than on text, because the two views
  // hold the title in different places: an input value in the editor,
  // document text in the reading view. The name is identical either way, and
  // that is the property that actually matters.
  const rows = page.getByRole('article')
  await expect(rows.nth(0)).toHaveAccessibleName('Check-in & Start')
  await expect(rows.nth(1)).toHaveAccessibleName('Agenda & Spielregeln')
  await expect(rows.nth(2)).toHaveAccessibleName('Energizer: Zwei Wahrheiten')
  await expect(rows.nth(3)).toHaveAccessibleName('Druckpunkte')
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

  // Nothing was auto-shortened: lunch still runs its full hour, and the block
  // after it starts accordingly. Asserted through the schedule rather than
  // through the duration control, which only exists in the editor.
  await expect(block(page, 'IT-Management verorten')).toContainText('15:30')
})

test('derives a cluster duration from its children', async ({ page }) => {
  // 15 + 10 + 10 = 35, and it starts where its first (pinned) child starts.
  await expect(section_(page, 'Ankommen & Rahmen')).toContainText('3 Blöcke · 35m')
  await expect(section_(page, 'Ankommen & Rahmen')).toContainText('13:00')
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

test.describe('drag & drop', () => {
  test.skip(({ isMobile }) => isMobile === true, 'The editor only mounts from 1024px up')

  // The live region doubles as the synchronisation point: asserting on it is
  // how we know dnd-kit has processed the previous input. Pressing keys back to
  // back without that was what made these tests flaky, and a fixed sleep would
  // only have hidden it.
  const live = (page: Page) => agenda(page).getByRole('status')

  test('moves a block to the end of the day with the mouse and recomputes everything', async ({
    page,
  }) => {
    const section = section_(page, 'Ankommen & Rahmen')
    await expect(section).toContainText('3 Blöcke · 35m')

    const handle = page.getByRole('button', { name: 'Energizer: Zwei Wahrheiten verschieben' })
    const target = block(page, 'Check-out')

    const from = (await handle.boundingBox())!
    const to = (await target.boundingBox())!

    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    // Past the 6px activation slop first, then to the target in steps so
    // dnd-kit sees a real gesture rather than a teleport.
    await page.mouse.move(from.x + from.width / 2, from.y + 20, { steps: 5 })
    await page.mouse.move(to.x + 200, to.y + to.height / 2, { steps: 15 })
    await expect(live(page)).toContainText('auf Tagesebene')
    await page.mouse.up()

    // The block left the section, so the section is one block and ten minutes shorter.
    await expect(section).toContainText('2 Blöcke · 25m')
    await expect(block(page, 'Energizer: Zwei Wahrheiten')).toBeVisible()
  })

  test('announces the projected landing spot on every keyboard indent step', async ({ page }) => {
    await page.getByRole('button', { name: 'Energizer: Zwei Wahrheiten verschieben' }).focus()
    await page.keyboard.press('Space')
    await expect(live(page)).toContainText('in Abschnitt Ankommen & Rahmen')

    // Without an announcement driven by the projection, indenting from the
    // keyboard would be completely silent: dnd-kit's own onDragOver fires only
    // when the row underneath changes, and indenting changes nothing vertically.
    await page.keyboard.press('ArrowLeft')
    await expect(live(page)).toContainText('auf Tagesebene')

    await page.keyboard.press('ArrowRight')
    await expect(live(page)).toContainText('in Abschnitt Ankommen & Rahmen')
  })
})

// NOT covered here, deliberately: FINISHING a keyboard drag. Picking a row up
// with Space works, and so does indenting it with the arrow keys, but the
// closing Space and the cancelling Escape never reach dnd-kit's keyboard
// sensor -- neither onDragEnd nor onDragCancel fires. There is no working
// behaviour to assert, and asserting it anyway would leave a permanently red
// test or, worse, a quietly weakened one. Tracked separately; the mouse path
// above exercises the same projection and move code.

test.describe('inline editing in the day view', () => {
  test.skip(({ isMobile }) => isMobile === true, 'The editor only mounts from 1024px up')

  test('changes a duration in the row and moves every following block', async ({ page }) => {
    const row = block(page, 'Spannungsfelder sammeln')
    await expect(block(page, 'Einwandintegration')).toContainText('14:50')

    const duration = row.getByLabel('Dauer')
    await duration.fill('45m')
    await duration.press('Tab')

    // The whole point of deriving times: one edit, and everything after it
    // moves without a save, a reload or a recalculation step.
    await expect(block(page, 'Einwandintegration')).toContainText('15:05')
    await expect(section_(page, 'Zielbild erarbeiten')).toContainText('55m')
  })

  test('reverts a duration it cannot read instead of guessing', async ({ page }) => {
    const duration = block(page, 'Spannungsfelder sammeln').getByLabel('Dauer')
    await duration.fill('völliger unsinn')
    await duration.press('Tab')

    // A silently wrong duration shifts every following block and is easy to miss.
    await expect(duration).toHaveValue('30m')
    await expect(block(page, 'Einwandintegration')).toContainText('14:50')
  })

  test('renames a block in place, with no dialog anywhere', async ({ page }) => {
    const title = block(page, 'Spannungsfelder sammeln').getByLabel('Titel')
    await title.fill('Spannungsfelder clustern')
    // Tab from the keyboard, not through the locator: the row's accessible name
    // is derived from this very input, so the locator stops matching its own
    // row the moment the value changes. That is correct behaviour -- the name
    // follows the title -- but it means the handle cannot be re-resolved.
    await page.keyboard.press('Tab')

    await expect(block(page, 'Spannungsfelder clustern')).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('opens the type’s own fields inside the same row', async ({ page }) => {
    const row = block(page, 'Spannungsfelder sammeln')
    const toggle = row.getByRole('button', { name: /Mehr Felder/ })

    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()

    await expect(row.getByLabel('Arbeitsauftrag')).toBeVisible()
    await expect(row.getByLabel('Gruppengröße')).toBeVisible()
    // Inside the row, not in a panel beside it.
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('keeps the collapsed table calm — four fields, not the whole schema', async ({ page }) => {
    // The guardrail against the agenda turning into a wall of forms.
    const row = block(page, 'Spannungsfelder sammeln')
    await expect(row.getByLabel('Arbeitsauftrag')).toHaveCount(0)
    await expect(row.getByLabel('Titel')).toBeVisible()
    await expect(row.getByLabel('Dauer')).toBeVisible()
  })
})
