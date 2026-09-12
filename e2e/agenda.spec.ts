import { expect, test, type Page } from '@playwright/test'
import { seedReferenceDay } from './fixtures/seed-day'

/**
 * What this file adds over the component tests: proof that the whole thing
 * survives a real browser on a real workshop.
 *
 * The derivations -- computed start times, the overlap stated in words, a
 * cluster duration summed from its children -- moved to
 * components/agenda/agenda-surface.test.tsx when the public demo page they used
 * to load was removed. What stayed is everything jsdom cannot answer: layout,
 * the OKLCH token system, and dragging.
 *
 * Blocks are queried as `article` named by their title and sections as `group`
 * named by theirs -- not by test ids, and not as generic list items, which
 * would collide with the bullet lists inside descriptions.
 */

const block = (page: Page, name: string) => page.getByRole('article', { name })
const section_ = (page: Page, name: string) => page.getByRole('group', { name })
const agenda = (page: Page) => page.getByRole('region', { name: /^Agenda/ })

test.beforeEach(async ({ page, request }) => {
  await seedReferenceDay(page, request)
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
  // Editable on a phone too; what these assert -- a drag across a grid, a
  // twelve-column field panel -- is about the wide layout.
  test.skip(({ isMobile }) => isMobile === true, 'Wide layout only')

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
  // Editable on a phone too; what these assert -- a drag across a grid, a
  // twelve-column field panel -- is about the wide layout.
  test.skip(({ isMobile }) => isMobile === true, 'Wide layout only')

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

  test('keeps the running totals in step with the table', async ({ page }) => {
    // The summary used to be rendered from the server's copy of the day and
    // never updated, so after the first edit it announced totals for an agenda
    // nobody could see -- most starkly on a fresh workshop, where it said
    // "0 Blöcke" above three of them -- German, because the suite is pinned to it.
    const summary = page.getByRole('main')
    const before = (await summary.textContent()) ?? ''
    const total = /·\s([0-9hm ]+)\sInhalt/.exec(before)?.[1]?.trim()
    expect(total, 'the summary states a content total').toBeTruthy()

    const duration = block(page, 'Spannungsfelder sammeln').getByLabel('Dauer')
    await duration.fill('45m')
    await duration.press('Tab')

    await expect(page.getByText(/Inhalt/).first()).not.toContainText(`${total} Inhalt`)
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

    // And NOT a second copy of what the row already edits. Two controls over
    // one value means whichever one was not touched writes its stale copy over
    // the other on blur.
    //
    // `exact` matters here and nowhere else in this file: getByLabel matches a
    // substring by default, so a bare 'Material' also finds the row's own
    // 'Material hinzufügen' -- and the assertion would contradict the one two
    // lines below it.
    await expect(row.getByLabel('Material', { exact: true })).toHaveCount(0)
    await expect(row.getByLabel('Sozialform', { exact: true })).toHaveCount(0)
    await expect(row.getByLabel('Material hinzufügen')).toBeVisible()
    await expect(row.getByRole('button', { name: /^Sozialform:/ })).toBeVisible()
  })

  test('keeps the collapsed table calm — the row essentials, not the whole schema', async ({
    page,
  }) => {
    // The guardrail against the agenda turning into a wall of forms.
    //
    // What a closed row carries is a decision, not an accident, so it is named
    // here in full: time, duration, title, the participation format, the
    // material, and the lock. Everything else the type declares waits behind
    // "Mehr Felder" -- the long-form task among it.
    const row = block(page, 'Spannungsfelder sammeln')

    await expect(row.getByLabel('Titel')).toBeVisible()
    await expect(row.getByLabel('Dauer')).toBeVisible()
    await expect(row.getByRole('button', { name: /^Sozialform:/ })).toBeVisible()
    await expect(row.getByLabel('Material hinzufügen')).toBeVisible()
    await expect(row.getByRole('button', { name: 'Startzeit fixieren' })).toBeAttached()

    await expect(row.getByLabel('Arbeitsauftrag')).toHaveCount(0)
    await expect(row.getByLabel('Gruppengröße')).toHaveCount(0)
  })

  test('sets a start time and holds it while the day above it changes', async ({ page }) => {
    const row = block(page, 'Spannungsfelder sammeln')

    await row.getByRole('button', { name: 'Startzeit fixieren' }).click()
    await row.getByLabel('Fixierte Startzeit').fill('15:45')
    await expect(row.getByText('Startzeit fixiert:')).toBeAttached()

    // Read off the field, not off the row's text: a pinned row being edited
    // carries its start time ONCE, in the input that sets it. Printing it
    // beside the input as well would read as two separate facts.
    await expect(row.getByLabel('Fixierte Startzeit')).toHaveValue('15:45')

    // Stretching a block above it must not move it. The conflict is reported
    // instead -- silently absorbing an overrun is how a plan stops being true.
    const earlier = block(page, 'Druckpunkte').getByLabel('Dauer')
    await earlier.fill('3h')
    await earlier.blur()

    await expect(row.getByLabel('Fixierte Startzeit')).toHaveValue('15:45')
    await expect(row).toContainText('Überschneidet den vorherigen Block')

    await page.reload()
    await expect(
      block(page, 'Spannungsfelder sammeln').getByLabel('Fixierte Startzeit'),
    ).toHaveValue('15:45')
  })

  test('keeps a material that was typed into the row', async ({ page }) => {
    const row = block(page, 'Spannungsfelder sammeln')

    await row.getByLabel('Material hinzufügen').fill('Moderationskoffer')
    await row.getByLabel('Material hinzufügen').press('Enter')
    await expect(row).toContainText('Moderationskoffer')

    await page.reload()
    await expect(block(page, 'Spannungsfelder sammeln')).toContainText('Moderationskoffer')
  })
})
