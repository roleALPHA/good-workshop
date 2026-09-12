import { expect, test, type Page } from '@playwright/test'

/**
 * Inviting somebody who has no account, all the way through.
 *
 * Flow 9 in docs/testing-conventions.md, and it is here rather than a level down
 * for one reason: everything below this can be told that a guest has no session.
 * Only a real browser can demonstrate that a guest with a real one still cannot
 * reach the library -- and that is the claim the whole feature rests on.
 *
 * The link is read off the screen rather than out of a mailbox. `playwright.config.ts`
 * sets no GW_MAIL_TRANSPORT and nothing is configured in the database, so
 * `deliversToRecipient()` is false and the invitation screen shows the link for
 * the member to pass on by hand. That is the documented behaviour for an install
 * with no relay, so testing through it covers two things at once.
 */

const connected = (page: Page) =>
  expect(page.getByRole('region', { name: /^Agenda/ })).toHaveAttribute('data-save-state', 'live')

let workshopTitle: string
let workshopUrl: string

test.beforeEach(async ({ page }) => {
  workshopTitle = `Gast ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  await page.goto('/library')
  await page.getByRole('button', { name: 'Neuer Workshop' }).click()
  await page.getByLabel('Titel des Workshops').fill(workshopTitle)
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click()
  await expect(page.getByRole('heading', { name: workshopTitle })).toBeVisible()
  await connected(page)
  workshopUrl = page.url()
})

/** Invites an address on the access screen and returns the link it shows. */
async function invite(page: Page, email: string, permission: string): Promise<string> {
  await page.getByRole('link', { name: 'Zugriff' }).click()
  await expect(page.getByRole('heading', { name: 'Gäste ohne Konto' })).toBeVisible()

  await page.getByLabel('E-Mail-Adresse').fill(email)
  await page.getByLabel('Recht').selectOption({ label: permission })
  await page.getByRole('button', { name: 'Einladen' }).click()

  // No relay, so the screen hands the link back instead of claiming it was sent.
  const link = page.getByText(/\/s\/[A-Za-z0-9_-]+$/)
  await expect(link).toBeVisible()
  return (await link.innerText()).trim()
}

test('a guest opens a shared agenda with the address it was sent to', async ({ page, browser }) => {
  const email = `gast-${Date.now()}@example.test`
  const link = await invite(page, email, 'Nur lesen')

  // A fresh context with no storageState: a guest is not signed in, and reusing
  // the member's context would make every assertion below meaningless.
  // `storageState: undefined` explicitly, and it is the point of the test:
  // the `browser` fixture inherits the project's `use` options, so a plain
  // newContext() would quietly carry the MEMBER's session -- and every
  // assertion below about what a guest cannot reach would pass for the wrong
  // reason.
  const guestContext = await browser.newContext({ storageState: undefined })
  const guest = await guestContext.newPage()
  try {
    await guest.goto(link)
    await expect(
      guest.getByRole('heading', { name: `Einladung zu ${workshopTitle}` }),
    ).toBeVisible()

    // The wrong address gets nowhere, and is told nothing about why.
    await guest.getByLabel('E-Mail-Adresse').fill('jemand.anderes@example.test')
    await guest.getByRole('button', { name: 'Agenda öffnen' }).click()
    await expect(guest.getByRole('alert')).toBeVisible()
    // Not the heading: `name` matches a substring, and the gate's own heading is
    // "Einladung zu <title>". Whether they got IN is the claim worth making.
    await expect(guest.getByRole('region', { name: /^Agenda/ })).toBeHidden()

    // The right one opens the agenda.
    await guest.getByLabel('E-Mail-Adresse').fill(email)
    await guest.getByRole('button', { name: 'Agenda öffnen' }).click()
    await expect(guest.getByRole('heading', { name: workshopTitle })).toBeVisible()
    await expect(guest.getByRole('region', { name: /^Agenda/ })).toBeVisible()

    // What a guest must NOT be offered. Named individually rather than as one
    // assertion about the header, because each is a different way out of the
    // one workshop they were invited to.
    await expect(guest.getByRole('link', { name: '← Bibliothek' })).toBeHidden()
    await expect(guest.getByRole('link', { name: 'Zugriff' })).toBeHidden()
    await expect(guest.getByRole('link', { name: 'Markdown' })).toBeHidden()
    await expect(guest.getByRole('link', { name: 'Drucken' })).toBeHidden()

    // Read permission: nothing on the page accepts typing.
    await expect(guest.getByRole('textbox')).toHaveCount(0)

    // And the rest of the application is not reachable with a guest session.
    await guest.goto('/library')
    await expect(guest.getByRole('heading', { name: 'Workshops' })).toBeHidden()
  } finally {
    await guestContext.close()
  }
})

test('a withdrawn invitation stops working', async ({ page, browser }) => {
  const email = `entzogen-${Date.now()}@example.test`
  const link = await invite(page, email, 'Nur lesen')

  const guestContext = await browser.newContext({ storageState: undefined })
  const guest = await guestContext.newPage()
  try {
    await guest.goto(link)
    await guest.getByLabel('E-Mail-Adresse').fill(email)
    await guest.getByRole('button', { name: 'Agenda öffnen' }).click()
    await expect(guest.getByRole('region', { name: /^Agenda/ })).toBeVisible()

    // The member takes the access away while the guest's page is open.
    await page.reload()
    await page
      .getByRole('listitem')
      .filter({ hasText: email })
      .getByRole('button', { name: 'Zugang entziehen' })
      .click()
    await expect(page.getByText(email)).toBeHidden()

    // The guest's next request is the one that fails -- the link is re-read on
    // every request rather than trusted from the cookie.
    await guest.reload()
    await expect(guest.getByRole('region', { name: /^Agenda/ })).toBeHidden()
  } finally {
    await guestContext.close()
  }
})

test('a guest invited to write shares the document with a member', async ({ page, browser }) => {
  const email = `schreiber-${Date.now()}@example.test`
  const link = await invite(page, email, 'Lesen und schreiben')

  const guestContext = await browser.newContext({ storageState: undefined })
  const guest = await guestContext.newPage()
  try {
    await guest.goto(link)
    await guest.getByLabel('E-Mail-Adresse').fill(email)
    await guest.getByRole('button', { name: 'Agenda öffnen' }).click()

    // The claim being tested: a guest with write permission gets a real socket
    // into the same room, not a local document whose edits go nowhere.
    await connected(guest)

    await guest.getByRole('button', { name: 'Block hinzufügen' }).click()
    await guest.getByLabel('Blocktyp suchen').fill('Pause')
    await guest.getByRole('button', { name: /Pause/ }).first().click()
    await expect(guest.getByRole('article', { name: 'Pause' })).toBeVisible()

    // And the member sees it, which is what "the same document" means. Straight
    // back to the day the workshop was created on -- finding it in the library by
    // title would be testing the library.
    await expect(async () => {
      await page.goto(workshopUrl)
      await expect(page.getByRole('article', { name: 'Pause' })).toBeVisible({ timeout: 3_000 })
    }).toPass({ timeout: 20_000 })
  } finally {
    await guestContext.close()
  }
})
