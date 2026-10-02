import {
  expect,
  request as apiRequest,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test'
import { callMcpTool, refusedMcpTool, tokenForMcp } from './fixtures/mcp'
import { inviteMember, signInAs, type Member } from './fixtures/members'
import { STORAGE_STATE } from './paths'

/**
 * Who sees what, between members of one workspace.
 *
 * Flow 11 in docs/testing-conventions.md. The rules themselves are asserted a
 * level down, against a real database (folder-visibility.db.test.ts,
 * folder-collaborators.db.test.ts, library.db.test.ts), where a second member
 * costs a row. What only this level shows is that every surface asks those
 * rules ABOUT THE RIGHT PERSON: the library page, the routes that 404, the
 * export, the sharing screens and the MCP endpoint, each reached with a
 * member's own session or token. A surface that quietly reads as the tenant,
 * or as nobody, passes every test below it.
 *
 * One admin (the suite's session) and two members, Lea and Mo, in one serial
 * story: each test hands out or takes back one grant and looks at what that
 * changed, from the member's side.
 */

test.describe.configure({ mode: 'serial' })

const run = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
const KUNDEN = `Kunden ${run}`
const ACME = `Acme ${run}`
const INTERN = `Intern ${run}`
const ACME_WORKSHOP = `Bei Acme ${run}`
const INTERN_WORKSHOP = `Intern-Planung ${run}`

let admin: Page
let api: APIRequestContext
let lea: Member
let mo: Member
const ids = { kunden: '', acme: '', intern: '' }
const workshops = {
  acme: { id: '', day: '' },
  intern: { id: '', day: '' },
}

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Ordner und Tags' })
const folderLink = (page: Page, name: string) =>
  sidebar(page).getByRole('link', { name, exact: true })
const dayUrl = (w: { id: string; day: string }) => `/w/${w.id}/d/${w.day}`

/** A workshop's row in the library, found through its link. */
const row = (page: Page, title: string) =>
  page.getByRole('listitem').filter({
    has: page.getByRole('link', { name: new RegExp(title) }).and(page.locator('[href^="/w/"]')),
  })

/** Hands out (or, with 'none', takes back) a grant on a folder's access screen. */
async function shareFolder(folderId: string, email: string, role: 'viewer' | 'editor' | 'none') {
  await admin.goto(`/f/${folderId}/sharing`)
  const select = admin.getByLabel(`Zugriff von ${email} auf diesen Ordner`)
  await select.selectOption(role)
  await expect(select).toHaveValue(role)
}

test.beforeAll(async ({ browser }, info) => {
  const context = await browser.newContext({ storageState: STORAGE_STATE })
  admin = await context.newPage()
  api = await apiRequest.newContext({ baseURL: info.project.use.baseURL })

  // Kunden / Acme, and Intern beside it -- all made by the admin, so neither
  // member holds anything on them until a test below says so.
  const folder = async (name: string, parentId: string | null) =>
    (await callMcpTool(api, 'create_folder', { name, parentId })).structured.id as string
  ids.kunden = await folder(KUNDEN, null)
  ids.acme = await folder(ACME, ids.kunden)
  ids.intern = await folder(INTERN, null)

  const workshop = async (title: string, folderId: string) => {
    const { structured } = await callMcpTool(api, 'create_workshop', { title, folderId })
    return { id: structured.workshopId as string, day: structured.dayId as string }
  }
  workshops.acme = await workshop(ACME_WORKSHOP, ids.acme)
  workshops.intern = await workshop(INTERN_WORKSHOP, ids.intern)

  const leaEmail = `lea-${run}@example.test`
  const moEmail = `mo-${run}@example.test`
  const leaLink = await inviteMember(admin, {
    firstName: 'Lea',
    lastName: 'Lesend',
    email: leaEmail,
  })
  const moLink = await inviteMember(admin, { firstName: 'Mo', lastName: 'Machend', email: moEmail })
  lea = await signInAs(browser, leaEmail, leaLink)
  mo = await signInAs(browser, moEmail, moLink)
})

test.afterAll(async () => {
  await lea?.context.close()
  await mo?.context.close()
  await admin?.context().close()
  await api?.dispose()
})

test('a member sees no folder and no workshop that nobody gave them', async () => {
  await lea.page.goto('/library')
  await expect(lea.page.getByRole('heading', { name: 'Workshops' })).toBeVisible()

  // Not just these three: a fresh member holds a role on no folder at all,
  // and the suite's database is full of the admin's.
  await expect(sidebar(lea.page).locator('a[href^="/library?folder="]')).toHaveCount(0)
  await expect(lea.page.getByText(ACME_WORKSHOP)).toHaveCount(0)

  // 404 rather than 403, everywhere: a refusal that says "forbidden" has
  // already told them the thing exists.
  for (const path of [
    `/library?folder=${ids.kunden}`,
    `/f/${ids.kunden}/sharing`,
    dayUrl(workshops.acme),
    `/w/${workshops.acme.id}/sharing`,
  ]) {
    expect((await lea.page.goto(path))?.status(), path).toBe(404)
  }
  expect((await lea.page.request.get(`/api/w/${workshops.acme.id}/export`)).status()).toBe(404)
})

test('a grant on a subfolder brings it and its workshops, and nothing above it', async () => {
  await shareFolder(ids.acme, lea.email, 'viewer')

  await lea.page.goto('/library')
  await expect(folderLink(lea.page, ACME)).toBeVisible()
  await expect(folderLink(lea.page, KUNDEN)).toHaveCount(0)
  await expect(folderLink(lea.page, INTERN)).toHaveCount(0)

  // The workshop arrives with the folder, and its row names the folder.
  await expect(row(lea.page, ACME_WORKSHOP)).toContainText(ACME)
  await expect(lea.page.getByText(INTERN_WORKSHOP)).toHaveCount(0)

  // The folder above is still not hers to open.
  expect((await lea.page.goto(`/library?folder=${ids.kunden}`))?.status()).toBe(404)

  // A viewer reads: the badge says so, and nothing that writes is offered.
  await lea.page.goto(dayUrl(workshops.acme))
  await expect(lea.page.getByRole('heading', { name: ACME_WORKSHOP })).toBeVisible()
  await expect(lea.page.getByText('Nur Lesen')).toBeVisible()
  await expect(lea.page.getByRole('button', { name: 'Block hinzufügen' })).toHaveCount(0)
  await expect(lea.page.getByRole('link', { name: 'Zugriff' })).toHaveCount(0)

  // The export travels further than any screen, so its path is cut the same way.
  const markdown = await (await lea.page.request.get(`/api/w/${workshops.acme.id}/export`)).text()
  expect(markdown).toContain(ACME)
  expect(markdown).not.toContain(KUNDEN)
})

test('a folder editor works in the subtree, but neither shares nor bins', async () => {
  await shareFolder(ids.kunden, mo.email, 'editor')

  await mo.page.goto('/library')
  await expect(folderLink(mo.page, KUNDEN)).toBeVisible()
  await expect(folderLink(mo.page, ACME)).toBeVisible()
  await expect(folderLink(mo.page, INTERN)).toHaveCount(0)

  // Editor on a workshop he does not own: filing it is his to do, binning it
  // is the owner's -- a folder grant is never ownership.
  const acmeRow = row(mo.page, ACME_WORKSHOP)
  await expect(
    acmeRow.getByRole('button', { name: `${ACME_WORKSHOP} in einen Ordner verschieben` }),
  ).toBeVisible()
  await expect(
    acmeRow.getByRole('button', { name: `${ACME_WORKSHOP} in den Papierkorb` }),
  ).toHaveCount(0)

  await mo.page.goto(dayUrl(workshops.acme))
  await expect(mo.page.getByRole('region', { name: /^Agenda/ })).toHaveAttribute(
    'data-save-state',
    'live',
  )
  await expect(mo.page.getByText('Nur Lesen')).toHaveCount(0)
  await expect(mo.page.getByRole('link', { name: 'Zugriff' })).toHaveCount(0)

  // Tidying the tree up stays an admin's call, even inside a folder he edits.
  await mo.page.goto('/library')
  await folderLink(mo.page, KUNDEN).hover()
  await sidebar(mo.page)
    .getByRole('button', { name: `Mehr zu Ordner ${KUNDEN}` })
    .click()
  await expect(
    sidebar(mo.page).getByRole('link', { name: `Zugriff auf Ordner ${KUNDEN}` }),
  ).toBeVisible()
  await expect(
    sidebar(mo.page).getByRole('button', { name: `Ordner ${KUNDEN} umbenennen` }),
  ).toHaveCount(0)
  await expect(
    sidebar(mo.page).getByRole('button', { name: `Ordner ${KUNDEN} entfernen` }),
  ).toHaveCount(0)
})

test('the sharing screen does not name a folder above that the reader cannot see', async () => {
  // Mo holds Acme through Kunden. Lea, who holds only Acme, sees that -- and
  // not where from.
  await lea.page.goto(`/f/${ids.acme}/sharing`)
  await expect(lea.page.getByRole('heading', { name: `Zugriff auf ${ACME}` })).toBeVisible()
  await expect(lea.page.getByLabel(`Zugriff von ${mo.email} auf diesen Ordner`)).toContainText(
    'Bearbeiten · über einen übergeordneten Ordner',
  )
  await expect(lea.page.getByText(KUNDEN)).toHaveCount(0)

  // Mo holds Kunden, so the same screen names it for him.
  await mo.page.goto(`/f/${ids.acme}/sharing`)
  await expect(mo.page.getByLabel(`Zugriff von ${mo.email} auf diesen Ordner`)).toContainText(
    `Bearbeiten · über ${KUNDEN}`,
  )
})

test('a workshop shared on its own does not reveal the folder it sits in', async () => {
  await admin.goto(`/w/${workshops.intern.id}/sharing`)
  await admin.getByLabel(`Zugriff von ${mo.email}`).selectOption('editor')
  await expect(admin.getByLabel(`Zugriff von ${mo.email}`)).toHaveValue('editor')

  await mo.page.goto('/library')
  await expect(row(mo.page, INTERN_WORKSHOP)).toContainText('In einem Ordner, der nicht deiner ist')
  await expect(row(mo.page, INTERN_WORKSHOP)).not.toContainText(INTERN)
  await expect(folderLink(mo.page, INTERN)).toHaveCount(0)

  const markdown = await (await mo.page.request.get(`/api/w/${workshops.intern.id}/export`)).text()
  expect(markdown).toContain(INTERN_WORKSHOP)
  // INTERN_WORKSHOP is "Intern-Planung …", which does not contain "Intern …".
  expect(markdown).not.toContain(INTERN)
})

test('a member’s MCP token sees what their library sees, and may file nothing elsewhere', async () => {
  const token = tokenForMcp(lea.email)

  const { structured } = await callMcpTool(api, 'list_folders', {}, undefined, token)
  expect(structured.folders).toEqual([{ id: ids.acme, name: ACME, parentId: null, depth: 0 }])

  const listed = (await callMcpTool(api, 'list_workshops', {}, undefined, token)).structured
    .workshops as { id: string }[]
  expect(listed.map((w) => w.id)).toContain(workshops.acme.id)
  expect(listed.map((w) => w.id)).not.toContain(workshops.intern.id)

  // A folder that is not in her tree is not a target -- one answer for "gone"
  // and "not yours", so the refusal confirms nothing.
  expect(
    await refusedMcpTool(api, 'create_workshop', { title: 'Hinein', folderId: ids.intern }, token),
  ).toContain('There is no such target folder.')
  // Each refusal is read for its reason: a malformed call is refused too, and
  // would pass here for the wrong one.
  expect(
    await refusedMcpTool(api, 'create_folder', { name: 'Hinein', parentId: ids.kunden }, token),
  ).toContain('Not found.')
  expect(
    await refusedMcpTool(api, 'get_workshop', { workshopId: workshops.intern.id }, token),
  ).toContain('Not found.')

  // And the tree is an admin's to rearrange, through MCP as much as on screen --
  // for Mo too, who edits in it.
  expect(
    await refusedMcpTool(api, 'delete_folder', { folderId: ids.acme }, tokenForMcp(mo.email)),
  ).toMatch(/admin/i)
})

test('a member has no administration', async () => {
  await lea.page.goto('/admin/members')
  // Filtered, because Next keeps an empty role="alert" of its own on every page
  // (the route announcer).
  await expect(lea.page.getByRole('alert').filter({ hasText: 'Admins' })).toBeVisible()
  await expect(lea.page.getByRole('button', { name: 'Mitglied einladen' })).toHaveCount(0)
  await expect(lea.page.getByText(mo.email)).toHaveCount(0)
})

test('taking the grant back takes the folder and its workshops with it', async () => {
  await shareFolder(ids.acme, lea.email, 'none')

  await lea.page.goto('/library')
  await expect(lea.page.getByRole('heading', { name: 'Workshops' })).toBeVisible()
  await expect(folderLink(lea.page, ACME)).toHaveCount(0)
  await expect(lea.page.getByText(ACME_WORKSHOP)).toHaveCount(0)
  expect((await lea.page.goto(dayUrl(workshops.acme)))?.status()).toBe(404)
  expect((await lea.page.goto(`/f/${ids.acme}/sharing`))?.status()).toBe(404)
})
