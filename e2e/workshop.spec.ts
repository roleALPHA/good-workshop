import { execFileSync } from 'node:child_process'
import { expect, test, type Page } from '@playwright/test'

/** Waits for the shared document to be connected before touching it. */
const connected = (page: Page) =>
  expect(page.getByRole('region', { name: /^Agenda/ })).toHaveAttribute('data-save-state', 'live')

/**
 * Reloads until the assertion holds.
 *
 * Edits reach the tables through the collaboration server on a debounce, so a
 * single reload can be a moment too early. Retrying the reload is honest about
 * that; a fixed sleep would only hide how long it actually takes.
 */
async function reloadUntil(page: Page, assertion: () => Promise<void>) {
  // Waits for the socket buffer to drain first. Reloading with bytes still
  // queued loses them -- a real user-facing risk, not merely a test-timing
  // problem, which is why the editor reports that state at all.
  await connected(page)

  await expect(async () => {
    await page.reload()
    await assertion()
  }).toPass({ timeout: 15_000 })
}

/**
 * The authenticated path, against a real database.
 *
 * These tests earn the right to say the editor persists anything. Everything
 * the public-demo suite covers happens in memory; here a reload is the
 * assertion, because a reload is what a user does when they are not sure it
 * saved.
 */

let workshopTitle: string

test.beforeEach(async ({ page }) => {
  workshopTitle = `Test ${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  await page.goto('/library')
  await page.getByRole('button', { name: 'Neuer Workshop' }).click()
  await page.getByLabel('Titel des Workshops').fill(workshopTitle)
  await page.getByRole('button', { name: 'Anlegen', exact: true }).click()

  // Straight into the new workshop: a freshly created plan you then have to
  // find in a list is a step nobody wants.
  await expect(page.getByRole('heading', { name: workshopTitle })).toBeVisible()
  await connected(page)
})

async function addBlock(page: Page, typeName: string) {
  await page.getByRole('button', { name: 'Block hinzufügen' }).click()
  await page.getByLabel('Blocktyp suchen').fill(typeName)
  await page
    .getByRole('button', { name: new RegExp(typeName) })
    .first()
    .click()
  await expect(page.getByRole('article', { name: typeName })).toBeVisible()
}

test('creates a workshop with its first day already in place', async ({ page }) => {
  // A workshop without a day is a dead end -- nothing to open, nothing to plan.
  await expect(page.getByText('ZEIT')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Block hinzufügen' })).toBeVisible()
})

test('adds a block and keeps it after a reload', async ({ page }) => {
  await addBlock(page, 'Gruppenarbeit')

  await reloadUntil(page, async () => {
    await expect(page.getByRole('article', { name: 'Gruppenarbeit' })).toBeVisible()
  })
})

test('persists a renamed block', async ({ page }) => {
  await addBlock(page, 'Gruppenarbeit')

  const title = page.getByRole('article', { name: 'Gruppenarbeit' }).getByLabel('Titel')
  await title.fill('Aufwärmen im Plenum')
  await page.keyboard.press('Tab')

  await reloadUntil(page, async () => {
    await expect(page.getByRole('article', { name: 'Aufwärmen im Plenum' })).toBeVisible()
  })
})

test('carries a duration change to a second browser, and the times with it', async ({
  page,
  context,
}) => {
  await addBlock(page, 'Gruppenarbeit')
  await addBlock(page, 'Pause')
  await expect(page.getByRole('article', { name: 'Pause' })).toContainText('09:45')

  // A second window on the same day. This is what live collaboration actually
  // is, and it proves the change left the browser without a reload -- which is
  // its own race, and a worse test for the same behaviour.
  const other = await context.newPage()
  await other.goto(page.url())
  await connected(other)
  await expect(other.getByRole('article', { name: 'Gruppenarbeit' })).toBeVisible()

  const duration = page.getByRole('article', { name: 'Gruppenarbeit' }).getByLabel('Dauer')
  await duration.fill('1h15')
  await page.keyboard.press('Tab')

  // Read back in canonical form: "1h15" goes in, "1h15m" comes out, and both
  // parse to the same 75 minutes.
  await expect(
    other.getByRole('article', { name: 'Gruppenarbeit' }).getByLabel('Dauer'),
  ).toHaveValue('1h15m')
  // And the derived times move for the other person too, without either side
  // recomputing anything.
  await expect(other.getByRole('article', { name: 'Pause' })).toContainText('10:15')

  await other.close()
})

test('shows a block one person adds to everyone else', async ({ page, context }) => {
  const other = await context.newPage()
  await other.goto(page.url())
  await connected(other)

  await addBlock(page, 'Energizer')

  await expect(other.getByRole('article', { name: 'Energizer' })).toBeVisible()
  await other.close()
})

test('persists a type-specific field edited inside the row', async ({ page }) => {
  await addBlock(page, 'Gruppenarbeit')

  const row = page.getByRole('article', { name: 'Gruppenarbeit' })
  await row.getByRole('button', { name: /Mehr Felder/ }).click()
  await row.getByLabel('Ergebnis').fill('Ein Flipchart je Gruppe')
  await page.keyboard.press('Tab')

  await reloadUntil(page, async () => {
    await page
      .getByRole('article', { name: 'Gruppenarbeit' })
      .getByRole('button', { name: /Mehr Felder/ })
      .click()
    await expect(page.getByLabel('Ergebnis')).toHaveValue('Ein Flipchart je Gruppe')
  })
})

test('exports the day as Markdown', async ({ page }) => {
  await addBlock(page, 'Gruppenarbeit')

  const url = (await page.getByRole('link', { name: 'Markdown' }).getAttribute('href'))!

  // Retried, because the export reads the relational tables and those trail
  // the live document by a moment -- that lag is the deliberate consequence of
  // Yjs being the editing layer and Postgres the record.
  await expect(async () => {
    // Fetched from inside the page rather than through page.request: the two do
    // not share a cookie jar in the way one would assume, and the browser's own
    // fetch is what a user's download actually looks like.
    const result = await page.evaluate(async (href) => {
      const response = await fetch(href, { credentials: 'same-origin' })
      return { type: response.headers.get('content-type') ?? '', body: await response.text() }
    }, url)

    expect(result.type).toContain('text/markdown')
    expect(result.body).toContain(workshopTitle)
    expect(result.body).toContain('Gruppenarbeit')
    expect(result.body).toContain('GoodWorkshop · powered by roleALPHA')
    // Retried at all, not budgeted for slowness: the tables trail the live
    // document by one debounce, deliberately. The generous budget this used to
    // carry blamed "a slow first materialisation" for what was really a race
    // between materialising and persisting -- fixed in the room, and guarded
    // by a test that reproduces it deterministically.
  }).toPass({ timeout: 10_000 })
})

test('renders a printable day without any editor JavaScript', async ({ page }) => {
  await addBlock(page, 'Gruppenarbeit')

  const url = (await page.getByRole('link', { name: 'Drucken' }).getAttribute('href'))!

  // Same one-debounce lag as the export: the print view renders from the tables.
  await expect(async () => {
    await page.goto(url)
    await expect(page.getByRole('heading', { name: workshopTitle })).toBeVisible()
    await expect(page.getByText('Gruppenarbeit')).toBeVisible()
  }).toPass({ timeout: 10_000 })
  // No drag handles, no inputs: what comes out of the printer must match what
  // was on screen, and a hydration pass would reflow it mid-dialog.
  await expect(page.getByRole('button', { name: /verschieben$/ })).toHaveCount(0)
  await expect(page.getByLabel('Dauer')).toHaveCount(0)
})

/**
 * A token, made once for the whole file through the CLI an operator would use.
 *
 * There is no UI for this yet, and inventing a test-only endpoint would prove
 * that endpoint works rather than that the real path does.
 */
let mcpToken: string | undefined
function tokenForMcp(): string {
  mcpToken ??= /gwp_[A-Za-z0-9_-]+/.exec(
    execFileSync(
      'node',
      [
        'scripts/cli.mjs',
        'token',
        'create',
        '--email',
        process.env.E2E_EMAIL ?? 'e2e@example.test',
        '--name',
        'e2e',
        '--scopes',
        'workshops:read,workshops:write',
      ],
      { encoding: 'utf8' },
    ),
  )![0]
  return mcpToken
}

function idsFrom(page: Page): { workshopId: string; dayId: string } {
  const match = /\/w\/([0-9a-f-]+)\/d\/([0-9a-f-]+)/.exec(page.url())
  if (!match) throw new Error(`Keine Workshop-Ids in ${page.url()}`)
  return { workshopId: match[1]!, dayId: match[2]! }
}

test('lets an LLM write into a day somebody has open', async ({ page, request }) => {
  // The bug this guards: MCP used to write straight to the tables while the
  // materialiser wrote the shared document back over them and deleted what it
  // did not hold. The model's block vanished a few seconds later, silently,
  // and only when somebody happened to have the day open.
  await addBlock(page, 'Gruppenarbeit')
  const { workshopId, dayId } = idsFrom(page)

  const response = await request.post('/api/mcp', {
    headers: {
      authorization: `Bearer ${tokenForMcp()}`,
      accept: 'application/json, text/event-stream',
    },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'add_module',
        arguments: { workshopId, dayId, typeKey: 'break', title: 'Vom Modell' },
      },
    },
  })
  // The body is carried into both messages: when this fails it is almost
  // always the collaboration server being unreachable, and the tool says so in
  // words. Asserting on the text alone would report "expected to contain" and
  // leave the actual reason in a log nobody opens.
  const body = await response.text()
  expect(response.ok(), body).toBeTruthy()
  expect(body, body).toContain('Block angelegt')

  // In the open editor, with no reload: the model joined the same room.
  await expect(page.getByRole('article', { name: 'Vom Modell' })).toBeVisible()

  // And both blocks survive. Before the fix the human's block outlived the
  // model's by exactly one materialisation.
  await reloadUntil(page, async () => {
    await expect(page.getByRole('article', { name: 'Gruppenarbeit' })).toBeVisible()
    await expect(page.getByRole('article', { name: 'Vom Modell' })).toBeVisible()
  })
})

test('lets an LLM write into a day nobody has open', async ({ page, request }) => {
  await addBlock(page, 'Gruppenarbeit')
  const { workshopId, dayId } = idsFrom(page)

  // Close the editor first, and wait out the room's grace period, so the write
  // has to open the room itself and seed it from the database. Seeding used to
  // happen in the browser, which quietly made "somebody opened this page" a
  // precondition -- and a model starting from an empty document would have had
  // the materialiser delete the day.
  await reloadUntil(page, async () => {
    await expect(page.getByRole('article', { name: 'Gruppenarbeit' })).toBeVisible()
  })
  await page.goto('/library')

  await expect(async () => {
    const response = await request.post('/api/mcp', {
      headers: {
        authorization: `Bearer ${tokenForMcp()}`,
        accept: 'application/json, text/event-stream',
      },
      data: {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'add_module',
          arguments: { workshopId, dayId, typeKey: 'break', title: 'Später ergänzt' },
        },
      },
    })
    expect(await response.text()).toContain('Block angelegt')
  }).toPass({ timeout: 20_000 })

  await page.goto(`/w/${workshopId}/d/${dayId}`)
  await expect(page.getByRole('article', { name: 'Gruppenarbeit' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Später ergänzt' })).toBeVisible()
})

test('names the other people on the day, and says which one is not a person', async ({
  page,
  context,
}) => {
  await addBlock(page, 'Gruppenarbeit')

  const other = await context.newPage()
  await other.goto(page.url())
  await connected(other)

  // A colleague, by name rather than by colour: a coloured dot alone tells a
  // colour-blind reader nothing, and tells anybody else nothing either.
  const presence = page.getByRole('list', { name: 'Weitere Personen an diesem Tag' })
  await expect(presence).toContainText(process.env.E2E_EMAIL ?? 'e2e@example.test')

  // Focus a field and let the other window show where this person is.
  await page.getByRole('article', { name: 'Gruppenarbeit' }).getByLabel('Titel').focus()
  await expect(other.getByRole('article', { name: 'Gruppenarbeit' })).toContainText(
    'bearbeitet diesen Block gerade',
  )

  await other.close()
})

test('applies a whole agenda from an LLM into an open day', async ({ page, request }) => {
  const { workshopId, dayId } = idsFrom(page)

  // apply_agenda is the tool that matters: a model writing twenty dependent
  // calls loses ids and drifts. The presence LABEL is asserted in the
  // component tests -- the model is only in the room for a few hundred
  // milliseconds, and racing that window is how a suite becomes flaky.
  const writing = request.post('/api/mcp', {
    headers: {
      authorization: `Bearer ${tokenForMcp()}`,
      accept: 'application/json, text/event-stream',
    },
    data: {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'apply_agenda',
        arguments: {
          workshopId,
          dayId,
          mode: 'append',
          items: [
            { kind: 'cluster', title: 'Aufwärmen', children: [{ typeKey: 'check_in' }] },
            { kind: 'module', typeKey: 'break', title: 'Kaffee' },
          ],
        },
      },
    },
  })

  const written = await (await writing).text()
  expect(written, written).toContain('3 Einträge geschrieben')
  await expect(page.getByRole('group', { name: 'Aufwärmen' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'Kaffee' })).toBeVisible()
})
