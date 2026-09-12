import { expect, test, type Page } from '@playwright/test'

/**
 * Folders: creating one inside another, and moving one afterwards.
 *
 * The domain could nest from the start -- createFolder has always taken a
 * parent -- but the sidebar gave no way to say which parent, and no way at all
 * to move a folder once it existed. Both are asserted here through the buttons
 * rather than through the repository, because that gap was entirely in the UI.
 */

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Ordner und Tags' })

/**
 * Folder links are matched EXACTLY throughout this file.
 *
 * A row carries a second link now -- "Zugriff auf Ordner X" -- and Playwright
 * matches an accessible name by substring, so a loose match resolves to two
 * elements and fails as a strict-mode violation. The sibling controls embed the
 * name too ("Ordner X entfernen"), and never collided, because they are
 * buttons rather than links.
 */

test('creates a folder inside another, then moves it back out', async ({ page }) => {
  const outer = `Außen ${Date.now()}`
  const inner = `Innen ${Date.now()}`

  await page.goto('/library')

  // A folder at the top level.
  await sidebar(page).getByRole('button', { name: 'Ordner', exact: true }).click()
  await page.getByLabel('Name des Ordners').fill(outer)
  await page.keyboard.press('Enter')
  await expect(sidebar(page).getByRole('link', { name: outer, exact: true })).toBeVisible()

  // Inside it: the new folder is created wherever you currently are.
  await sidebar(page).getByRole('link', { name: outer, exact: true }).click()
  await sidebar(page).getByRole('button', { name: 'Ordner', exact: true }).click()
  await page.getByLabel('Name des Unterordners').fill(inner)
  await page.keyboard.press('Enter')

  const child = sidebar(page).getByRole('link', { name: inner, exact: true })
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
    const moved = sidebar(page).getByRole('link', { name: inner, exact: true })
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
  await sidebar(page).getByRole('link', { name: parent, exact: true }).click()
  await sidebar(page).getByRole('button', { name: 'Ordner', exact: true }).click()
  await page.getByLabel('Name des Unterordners').fill(child)
  await page.keyboard.press('Enter')
  await expect(sidebar(page).getByRole('link', { name: child, exact: true })).toBeVisible()

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

test('keeps the folder tree out of the way on a phone until it is asked for', async ({ page }) => {
  // Shown in full, a tree of any size pushes the workshops off the screen: on a
  // phone the list is what you came for, and the folders are how you narrow it
  // down once you need to.
  await page.setViewportSize({ width: 390, height: 844 })

  const name = `Klapp ${Date.now()}`
  await page.goto('/library')
  await page.getByRole('button', { name: /Ordner (ein|aus)blenden/ }).click()
  await sidebar(page).getByRole('button', { name: 'Ordner', exact: true }).click()
  await page.getByLabel('Name des Ordners').fill(name)
  await page.keyboard.press('Enter')
  await expect(sidebar(page).getByRole('link', { name, exact: true })).toBeVisible()

  // Folded away again, and the list is back at the top.
  await page.getByRole('button', { name: /Ordner (ein|aus)blenden/ }).click()
  await expect(sidebar(page).getByRole('link', { name, exact: true })).toBeHidden()

  // The point of folding it away: what you came for is on screen without
  // scrolling. Asserted on the search box, which sits directly above the list
  // and is there whether or not the library has anything in it yet.
  await expect(page.getByPlaceholder('Suchen')).toBeInViewport()
  await expect(page.getByRole('heading', { name: 'Workshops' })).toBeInViewport()
})

test('shows the folder tree on a phone too', async ({ page }) => {
  // The sidebar was `hidden md:block`, so on a phone the library had no folders
  // at all: no way to see the structure, no way to switch between branches,
  // and the workshops of every folder in one undifferentiated list.
  await page.setViewportSize({ width: 390, height: 844 })

  const name = `Handy ${Date.now()}`
  await page.goto('/library')
  await page.getByRole('button', { name: /Ordner (ein|aus)blenden/ }).click()
  await sidebar(page).getByRole('button', { name: 'Ordner', exact: true }).click()
  await page.getByLabel('Name des Ordners').fill(name)
  await page.keyboard.press('Enter')

  await expect(sidebar(page).getByRole('link', { name, exact: true })).toBeVisible()

  // And it filters, which is what the tree is for.
  await sidebar(page).getByRole('link', { name, exact: true }).click()
  await expect(page).toHaveURL(/folder=/)
})

test.describe('filing things by dragging them', () => {
  // By name: dnd-kit keeps a second, unnamed status region of its own, which
  // we silence but cannot remove.
  const live = (page: Page) => page.getByRole('status', { name: 'Verschieben' })

  async function makeFolder(page: Page, name: string) {
    await sidebar(page).getByRole('button', { name: 'Ordner', exact: true }).click()
    await page.getByLabel('Name des Ordners').fill(name)
    await page.keyboard.press('Enter')
    await expect(sidebar(page).getByRole('link', { name, exact: true })).toBeVisible()
  }

  /** Through the button and the heading, not Enter: creating one navigates. */
  async function makeWorkshop(page: Page, title: string) {
    await page.getByRole('button', { name: 'Neuer Workshop' }).click()
    await page.getByLabel('Titel des Workshops').fill(title)
    await page.getByRole('button', { name: 'Anlegen', exact: true }).click()
    await expect(page.getByRole('heading', { name: title })).toBeVisible()
    await page.goto('/library')
  }

  /**
   * Press, cross the 6px activation slop, then travel in steps like a hand.
   *
   * Both boxes are measured immediately before the press and the page is at the
   * top: dnd-kit scrolls the window on its own when a drag nears an edge, and a
   * coordinate measured earlier then points somewhere else entirely. That is
   * not hypothetical -- it is what these tests did on a long folder tree.
   */
  async function dragTo(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 10, from.y, { steps: 5 })
    await page.mouse.move(to.x, to.y, { steps: 15 })
  }

  const centreOf = async (locator: ReturnType<Page['getByRole']>) => {
    const box = (await locator.boundingBox())!
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }

  test('drags a workshop into a folder and back out again', async ({ page }) => {
    const workshop = `Gezogen ${Date.now()}`

    await page.goto('/library')
    await makeFolder(page, `Ziel ${Date.now()}`)
    await makeWorkshop(page, workshop)

    // The FIRST folder in the tree, whichever it is, and the newest workshop,
    // which the list puts at the top. Both sit near the top of the page, so the
    // gesture stays put however many folders the tenant has.
    await page.evaluate(() => window.scrollTo(0, 0))
    const folderLink = sidebar(page).getByRole('link').nth(1)
    const folder = (await folderLink.innerText()).trim()

    const handle = page.getByRole('button', { name: `${workshop} in einen Ordner verschieben` })
    await expect(handle).toBeInViewport()
    await expect(folderLink).toBeInViewport()

    await dragTo(page, await centreOf(handle), await centreOf(folderLink))
    await expect(live(page)).toContainText(folder)
    await page.mouse.up()

    // It says where the workshop sits now, and so does the row itself.
    const row = page.getByRole('link', { name: new RegExp(workshop) }).locator('..')
    await expect(live(page)).toContainText(`liegt jetzt in ${folder}`)
    await expect(row).toContainText(folder)

    /**
     * And straight out again, without reloading in between.
     *
     * The second leg is the regression guard. The drop used to call the server
     * action on its own rather than through the list, which left the row still
     * claiming its old folder -- and the NEXT drop then did nothing at all,
     * because it compared against that stale claim.
     */
    await page.evaluate(() => window.scrollTo(0, 0))
    const root = sidebar(page).getByRole('link', { name: 'Alle Workshops' })
    await dragTo(page, await centreOf(handle), await centreOf(root))
    await page.mouse.up()

    await expect(live(page)).toContainText('liegt jetzt auf der obersten Ebene')
    await expect(row).toContainText('Ohne Ordner')
  })

  test('nests a folder under the one above it by dragging sideways', async ({ page }) => {
    const parent = `Dach ${Date.now()}`
    const child = `Drunter ${Date.now()}`

    await page.goto('/library')
    await makeFolder(page, parent)
    await makeFolder(page, child)

    // Sideways, not upwards. The horizontal travel is what says how deep, and
    // the row above decides which parent that is -- dragging ONTO the row above
    // would mean "put me in front of it" instead.
    const handle = sidebar(page).getByRole('button', { name: `Ordner ${child} verschieben` })
    await handle.scrollIntoViewIfNeeded()
    const from = await centreOf(handle)
    await dragTo(page, from, { x: from.x + 30, y: from.y })
    await page.mouse.up()

    // Indented, which is how the sidebar says "below".
    await expect(async () => {
      const padding = await sidebar(page)
        .getByRole('link', { name: child, exact: true })
        .evaluate((el) => (el.closest('li') as HTMLElement).style.paddingLeft)
      expect(padding).not.toBe('0px')
    }).toPass({ timeout: 10_000 })
  })

  test('files a workshop from a phone, where there is nothing to drag onto', async ({ page }) => {
    // The folder tree is behind a disclosure at this width, so there is no drop
    // target on screen. The select is not a consolation prize here -- it is the
    // mechanism, and this is the test that says so.
    await page.setViewportSize({ width: 390, height: 844 })

    const folder = `Handyordner ${Date.now()}`
    const workshop = `Handyworkshop ${Date.now()}`

    await page.goto('/library')
    await page.getByRole('button', { name: /Ordner (ein|aus)blenden/ }).click()
    await makeFolder(page, folder)
    await makeWorkshop(page, workshop)

    const control = page.getByRole('button', { name: `${workshop} in einen Ordner verschieben` })
    // No drag source below md: a plain button, and nothing announcing itself
    // as draggable to whoever is listening.
    await expect(control).toBeVisible()
    await expect(control).not.toHaveAttribute('aria-roledescription', 'draggable')
    await control.click()
    await page.getByLabel('Verschieben nach').selectOption({ label: folder })

    await page.getByRole('button', { name: /Ordner (ein|aus)blenden/ }).click()
    await sidebar(page).getByRole('link', { name: folder, exact: true }).click()
    await expect(page.getByRole('link', { name: new RegExp(workshop) })).toBeVisible()
  })
})

/**
 * Folder-level collaboration, through the buttons.
 *
 * The rule itself -- subtree reach, nearest folder wins, nobody hands on more
 * than they hold -- is asserted against a real database in
 * src/domain/workshop/folder-collaborators.db.test.ts, where a second member
 * costs a row rather than a second browser session. What only a browser can
 * show is that the route, the action and the four catalogs are wired together
 * at all.
 */
test('opens the access screen of a folder from the tree', async ({ page }) => {
  const name = `Geteilt ${Date.now()}`

  await page.goto('/library')
  await sidebar(page).getByRole('button', { name: 'Ordner', exact: true }).click()
  await page.getByLabel('Name des Ordners').fill(name)
  await page.keyboard.press('Enter')
  await expect(sidebar(page).getByRole('link', { name, exact: true })).toBeVisible()

  await sidebar(page)
    .getByRole('link', { name: `Zugriff auf Ordner ${name}` })
    .click()

  await expect(page.getByRole('heading', { name: `Zugriff auf ${name}` })).toBeVisible()
  // The sentence that keeps somebody from sharing a subtree by accident: it
  // reaches workshops other people own, and filing one here shares it.
  await expect(page.getByText(/Gilt für alles in diesem Ordner/)).toBeVisible()

  // The creator may hand on both roles; the select says so.
  const anySelect = page.getByRole('combobox').first()
  await expect(anySelect.getByRole('option', { name: 'Bearbeiten' })).toBeAttached()
})
