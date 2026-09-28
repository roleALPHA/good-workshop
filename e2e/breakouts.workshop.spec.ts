import { expect, test, type Page } from '@playwright/test'
import { seedReferenceDay } from './fixtures/seed-day'

/**
 * What only a real browser can answer about a breakout: whether the strands
 * actually stand side by side, whether they stack on a phone without pushing
 * the page sideways, and whether the arrow keys walk the columns the way the
 * pure functions say they should.
 *
 * Everything about the wording -- "3 strands, at the same time", "strand 2 of
 * 3" -- is asserted in the component tests, where it belongs.
 */
const group = (page: Page, name: string | RegExp) => page.getByRole('group', { name })
const live = (page: Page) => page.getByRole('region', { name: /^Agenda/ }).getByRole('status')

/** Picks a block type in the strand whose add button was just pressed. */
async function pickBreak(page: Page) {
  await page
    .getByRole('button', { name: /^Pause/ })
    .first()
    .click()
}

/** Creates a breakout and returns once its two strands are on screen. */
async function addBreakout(page: Page) {
  await page.getByRole('button', { name: 'Breakout hinzufügen' }).click()
  await expect(group(page, /Neuer Breakout/)).toBeVisible()
}

test.beforeEach(async ({ page, request }) => {
  await seedReferenceDay(page, request)
})

test.describe('breakouts', () => {
  test('are created in place, with two strands and the cursor in the name', async ({ page }) => {
    await addBreakout(page)

    // Two strands to start with: one is not a breakout, none is an empty raster.
    await expect(group(page, /Neuer Strang 1/)).toBeVisible()
    await expect(group(page, /Neuer Strang 2/)).toBeVisible()
    // Inline, never a dialog -- docs/ui-conventions.md reserves those for
    // confirming the irreversible.
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByLabel('Name des Breakouts', { exact: true })).toBeFocused()
  })

  test('puts the strands side by side on a desktop', async ({ page }) => {
    await addBreakout(page)

    const first = await group(page, /Neuer Strang 1/).boundingBox()
    const second = await group(page, /Neuer Strang 2/).boundingBox()

    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    // Same row, different columns. This is the layout claim, and the only
    // place it can be made.
    expect(Math.abs(first!.y - second!.y)).toBeLessThan(4)
    expect(second!.x).toBeGreaterThan(first!.x + first!.width - 4)
  })

  test('adds a third strand from the raster itself', async ({ page }) => {
    await addBreakout(page)
    await page.getByRole('button', { name: 'Strang hinzufügen' }).click()
    await expect(group(page, /Neuer Strang 3/)).toBeVisible()
  })

  test('adds a block into one strand, not into the day', async ({ page }) => {
    await addBreakout(page)
    await page.getByRole('button', { name: /^Block in Neuer Strang 2 hinzufügen$/ }).click()
    await pickBreak(page)

    const strand = group(page, /Neuer Strang 2/)
    await expect(strand.getByRole('article')).toHaveCount(1)
    await expect(group(page, /Neuer Strang 1/).getByRole('article')).toHaveCount(0)
  })

  test('starts every strand at the same time and ends with the longest', async ({ page }) => {
    await addBreakout(page)
    await page.getByRole('button', { name: /^Block in Neuer Strang 1 hinzufügen$/ }).click()
    await pickBreak(page)
    await page.getByRole('button', { name: /^Block in Neuer Strang 2 hinzufügen$/ }).click()
    await pickBreak(page)

    const first = group(page, /Neuer Strang 1/)
    const second = group(page, /Neuer Strang 2/)
    // Both strand heads quote their own span; the starts have to agree.
    const startOf = async (locator: ReturnType<typeof group>) =>
      ((await locator.textContent()) ?? '').match(/(\d{2}:\d{2})/)?.[1]

    expect(await startOf(first)).toBe(await startOf(second))
  })

  test('says which strand a block would land in', async ({ page }) => {
    await addBreakout(page)
    await page.getByRole('button', { name: /^Block in Neuer Strang 1 hinzufügen$/ }).click()
    await pickBreak(page)

    const handle = page.getByRole('button', { name: /Pause verschieben/ }).first()
    await handle.focus()
    await page.keyboard.press('Space')

    // The announcement is what a screen-reader user has instead of the columns,
    // so it has to name the strand AND the breakout -- "in section A" would not
    // say which of the rooms.
    await expect(live(page)).toContainText('in Strang Neuer Strang 1 von Breakout Neuer Breakout')
    await page.keyboard.press('Escape')
  })

  test('moves a block into the next strand with the mouse', async ({ page }) => {
    await addBreakout(page)
    await page.getByRole('button', { name: /^Block in Neuer Strang 1 hinzufügen$/ }).click()
    await pickBreak(page)

    const first = group(page, /Neuer Strang 1/)
    const second = group(page, /Neuer Strang 2/)
    await expect(first.getByRole('article')).toHaveCount(1)

    // hover() rather than coordinates from an earlier boundingBox: the page can
    // scroll between measuring and pressing, and then the press lands on
    // nothing and the drag never starts -- silently, as an empty live region.
    const handle = page.getByRole('button', { name: /Pause verschieben/ }).first()
    await handle.hover()
    await page.mouse.down()

    const from = (await handle.boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + 20, { steps: 5 })
    // Measured after the drag has started, for the same reason.
    const to = (await second.boundingBox())!
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 })
    await expect(live(page)).toContainText('Neuer Strang 2')
    await page.mouse.up()

    await expect(second.getByRole('article')).toHaveCount(1)
    await expect(first.getByRole('article')).toHaveCount(0)
  })
})

test.describe('breakouts at phone width', () => {
  test('stacks the strands without ever scrolling sideways', async ({ page }) => {
    // Built at desktop width, because the editor does not mount below 1024px --
    // the same reason agenda.spec.ts does not run in the mobile project. Then
    // narrowed, which is what actually exercises the media query the stacking
    // hangs on.
    await addBreakout(page)
    await page.setViewportSize({ width: 390, height: 844 })

    const first = await group(page, /Neuer Strang 1/).boundingBox()
    const second = await group(page, /Neuer Strang 2/).boundingBox()
    expect(Math.abs(first!.x - second!.x)).toBeLessThan(4)
    expect(second!.y).toBeGreaterThan(first!.y + first!.height - 4)

    // The acceptance criterion from docs/ui-conventions.md, stated out loud.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
