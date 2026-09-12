import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * Getting a second person into a workshop, end to end.
 *
 * Every piece of the collaboration machinery is worth nothing if there is no
 * way to invite anybody, and until now there was none outside a shell on the
 * server. This walks the whole path an admin actually takes: invite, follow
 * the link as that person, get shared with, edit at the same time.
 */

const colleague = `kollegin-${Date.now()}@example.test`

test.describe.configure({ mode: 'serial' })

const connected = (page: Page) =>
  expect(page.getByRole('region', { name: /^Agenda/ })).toHaveAttribute('data-save-state', 'live')

/** A second browser, signed in as somebody else entirely. */
async function asColleague(browser: Browser, link: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(link)
  return { context, page }
}

test('invites a colleague, shares a workshop, and edits it together', async ({ page, browser }) => {
  // ── Invite ────────────────────────────────────────────────────────────
  await page.goto('/admin/members')
  await page.getByRole('button', { name: 'Mitglied einladen' }).click()
  await page.getByLabel('E-Mail-Adresse').fill(colleague)
  await page.getByRole('button', { name: 'Einladen', exact: true }).click()

  // With no mail relay the link is shown instead of claimed as sent. That is
  // the supported on-prem setup, so it is the one the test walks.
  const link = await page.getByText(/\/verify\?token=/).innerText()
  expect(link).toContain('/verify?token=')
  await expect(page.getByRole('listitem').filter({ hasText: colleague })).toBeVisible()

  // ── Create something to share ─────────────────────────────────────────
  const title = `Geteilt ${Date.now()}`
  await page.goto('/library')
  await page.getByRole('button', { name: 'Neuer Workshop' }).click()
  await page.getByLabel('Titel des Workshops').fill(title)
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
  await connected(page)

  const dayUrl = page.url()
  const workshopId = /\/w\/([0-9a-f-]+)\//.exec(dayUrl)![1]!

  // ── The colleague signs in and cannot see it yet ───────────────────────
  const second = await asColleague(browser, link.trim())
  // The status, not the wording: 404 rather than 403 is the actual claim --
  // an unshared workshop must not confirm that it exists -- and the sentence
  // on the page belongs to Next.
  expect((await second.page.goto(dayUrl))?.status()).toBe(404)

  // ── Share ─────────────────────────────────────────────────────────────
  await page.goto(`/w/${workshopId}/sharing`)
  await page.getByLabel(`Zugriff von ${colleague}`).selectOption('editor')
  await expect(page.getByLabel(`Zugriff von ${colleague}`)).toHaveValue('editor')

  // ── And now they are in the same document ─────────────────────────────
  await second.page.goto(dayUrl)
  await connected(second.page)

  await page.goto(dayUrl)
  await connected(page)
  await page.getByRole('button', { name: 'Block hinzufügen' }).click()
  await page.getByLabel('Blocktyp suchen').fill('Energizer')
  await page
    .getByRole('button', { name: /Energizer/ })
    .first()
    .click()

  await expect(second.page.getByRole('article', { name: 'Energizer' })).toBeVisible()
  // Named, not merely counted: the point of presence is recognising who it is.
  await expect(page.getByRole('list', { name: 'Weitere Personen an diesem Tag' })).toContainText(
    colleague,
  )

  // ── Downgraded to reading: the agenda, and no way into it ─────────────
  // The colleague used to be handed the whole editor here, connected to
  // nothing -- so every control worked and every change was gone on reload.
  await page.goto(`/w/${workshopId}/sharing`)
  await page.getByLabel(`Zugriff von ${colleague}`).selectOption('viewer')
  await expect(page.getByLabel(`Zugriff von ${colleague}`)).toHaveValue('viewer')

  await second.page.goto(dayUrl)
  await expect(second.page.getByText('Nur Lesen')).toBeVisible()

  // What they came for is still all there -- but it arrives by a different
  // road. An editor is handed the live document; a reader is handed the
  // server-rendered one, which comes from the relational tables, which the room
  // writes on a 3s debounce (`materializeDebounceMs`). So this reloads until
  // the block has landed rather than assuming it already has. The wait is the
  // materialisation, not the rendering.
  await expect(async () => {
    await second.page.reload()
    await expect(second.page.getByRole('article', { name: 'Energizer' })).toBeVisible({
      timeout: 1_000,
    })
  }).toPass({ timeout: 15_000 })

  // And deliberately NOT `connected()`: there is no document to join.
  await expect(second.page.getByRole('button', { name: 'Block hinzufügen' })).toHaveCount(0)
  await expect(second.page.getByRole('region', { name: /^Agenda/ })).not.toHaveAttribute(
    'data-save-state',
    'live',
  )

  // The same answer one level up, before the workshop is even opened -- and
  // no bin button, which the server would refuse anyway.
  await second.page.goto('/library')
  const shared = second.page.getByRole('listitem').filter({ hasText: title })
  await expect(shared.getByText('Nur Lesen')).toBeVisible()
  await expect(shared.getByRole('button', { name: /Papierkorb/ })).toHaveCount(0)

  // ── Revoking takes it away again ──────────────────────────────────────
  await page.goto(`/w/${workshopId}/sharing`)
  await page.getByLabel(`Zugriff von ${colleague}`).selectOption('none')
  await expect(page.getByLabel(`Zugriff von ${colleague}`)).toHaveValue('none')

  expect((await second.page.goto(dayUrl))?.status()).toBe(404)

  await second.context.close()
})

// The last-admin refusal is NOT asserted here, deliberately. Driving it
// through the browser means demoting the signed-in admin of a shared fixture:
// where the tenant happens to have a second admin the demotion succeeds, the
// account the whole suite logs in with loses its rights, and every later run
// pays for it. Its own tenant and its own population is what that rule needs,
// which is where the database suite asserts it.
