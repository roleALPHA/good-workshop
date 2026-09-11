import { expect, test, type Page } from '@playwright/test'

/**
 * Folders: creating one inside another, and moving one afterwards.
 *
 * The domain could nest from the start -- createFolder has always taken a
 * parent -- but the sidebar gave no way to say which parent, and no way at all
 * to move a folder once it existed. Both are asserted here through the buttons
 * rather than through the repository, because that gap was entirely in the UI.
 */

const sidebar = (page: Page) =>
  page.getByRole('navigation', { name: 'Ordner und Tags' })

test('creates a folder inside another, then moves it back out', async ({ page }) => {
  const outer = `Außen ${Date.now()}`
  const inner = `Innen ${Date.now()}`

  await page.goto('/library')

  // A folder at the top level.
  await sidebar(page).getByRole('button', { name: 'Ordner', exact: true }).click()
  await page.getByLabel('Name des Ordners').fill(outer)
  await page.keyboard.press('Enter')
  await expect(sidebar(page).getByRole('link', { name: outer })).toBeVisible()

  // Inside it: the new folder is created wherever you currently are.
  await sidebar(page).getByRole('link', { name: outer }).click()
  await sidebar(page).getByRole('button', { name: 'Ordner', exact: true }).click()
  await page.getByLabel('Name des Unterordners').fill(inner)
  await page.keyboard.press('Enter')

  const child = sidebar(page).getByRole('link', { name: inner })
  await expect(child).toBeVisible()
  // Indented, which is how the sidebar says "below".
  const indent = await child.evaluate((el) => (el.closest('li') as HTMLElement).style.paddingLeft)
  expect(indent).not.toBe('0px')

  // And out again, to the top level.
  await sidebar(page)
    .getByRole('button', { name: `Ordner ${inner} verschieben` })
    .click()
  await sidebar(page).getByLabel('Verschieben nach').selectOption('')

  await expect(async () => {
    const moved = sidebar(page).getByRole('link', { name: inner })
    const padding = await moved.evaluate(
      (el) => (el.closest('li') as HTMLElement).style.paddingLeft,
    )
    expect(padding).toBe('0px')
  }).toPass({ timeout: 10_000 })
})

test('does not offer a folder its own subtree as a destination', async ({ page }) => {
  const parent = `Eltern ${Date.now()}`
  const child = `Kind ${Date.now()}`

  await page.goto('/library')
  await sidebar(page).getByRole('button', { name: 'Ordner', exact: true }).click()
  await page.getByLabel('Name des Ordners').fill(parent)
  await page.keyboard.press('Enter')
  await sidebar(page).getByRole('link', { name: parent }).click()
  await sidebar(page).getByRole('button', { name: 'Ordner', exact: true }).click()
  await page.getByLabel('Name des Unterordners').fill(child)
  await page.keyboard.press('Enter')
  await expect(sidebar(page).getByRole('link', { name: child })).toBeVisible()

  await sidebar(page)
    .getByRole('button', { name: `Ordner ${parent} verschieben` })
    .click()
  const options = await sidebar(page)
    .getByLabel('Verschieben nach')
    .locator('option')
    .allInnerTexts()

  // Moving a folder below itself would cut the branch off the root: invisible
  // in the sidebar, reachable only by id.
  expect(options.some((text) => text.includes(child))).toBe(false)
  expect(options.some((text) => text.includes(parent))).toBe(false)
})

test('shows the folder tree on a phone too', async ({ page }) => {
  // The sidebar was `hidden md:block`, so on a phone the library had no folders
  // at all: no way to see the structure, no way to switch between branches,
  // and the workshops of every folder in one undifferentiated list.
  await page.setViewportSize({ width: 390, height: 844 })

  const name = `Handy ${Date.now()}`
  await page.goto('/library')
  await sidebar(page).getByRole('button', { name: 'Ordner', exact: true }).click()
  await page.getByLabel('Name des Ordners').fill(name)
  await page.keyboard.press('Enter')

  await expect(sidebar(page).getByRole('link', { name })).toBeVisible()

  // And it filters, which is what the tree is for.
  await sidebar(page).getByRole('link', { name }).click()
  await expect(page).toHaveURL(/folder=/)
})
