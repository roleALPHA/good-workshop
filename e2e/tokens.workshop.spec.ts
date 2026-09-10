import { expect, test } from '@playwright/test'

/**
 * Connecting an LLM client, without a shell on the server.
 *
 * The whole point of the screen: a token made in the browser has to be one the
 * MCP endpoint actually accepts, and pulling it back has to stop it working at
 * once. Asserting that the row appears in a list would prove neither.
 */

test.describe.configure({ mode: 'serial' })

test('makes a token that works, and can take it back', async ({ page, request }) => {
  const name = `E2E ${Date.now()}`

  await page.goto('/settings/tokens')
  await page.getByRole('button', { name: 'Token anlegen' }).click()
  await page.getByLabel('Wofür ist es?').fill(name)
  await page.getByLabel('Workshops schreiben').check()
  await page.getByRole('button', { name: 'Token anlegen' }).click()

  // Shown once, because only its hash is stored. Read from the named panel:
  // the list below shows the public half of every other token, and those start
  // with gwp_ too.
  const panel = page.getByRole('region', { name: 'Dein neues Token' })
  const token = (await panel.getByText(/^gwp_/).innerText()).trim()
  expect(token).toMatch(/^gwp_[A-Za-z0-9_-]+_[A-Za-z0-9_-]+$/)

  const call = (body: unknown) =>
    request.post('/api/mcp', {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/json, text/event-stream',
      },
      data: body,
    })

  const listed = await call({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: 'list_workshops', arguments: {} },
  })
  const body = await listed.text()
  expect(body, body).not.toContain('invalid_token')

  // And now take it back -- this one, by name, not whichever row happens to be
  // first. A test that revokes a stranger's token is a test that breaks the
  // next one.
  await page.reload()
  await page.getByRole('button', { name: `Token ${name} zurückziehen` }).click()
  await expect(page.getByRole('button', { name: `Token ${name} zurückziehen` })).toHaveCount(0)

  const after = await call({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'list_workshops', arguments: {} },
  })
  // Not "no results": the credential itself is refused.
  expect(after.status()).toBe(401)
})

test('offers no way to grant member management', async ({ page }) => {
  await page.goto('/settings/tokens')
  await page.getByRole('button', { name: 'Token anlegen' }).click()

  // A decision to hold even when somebody asks for it: there is no scope to
  // grant, rather than a scope that happens to be unused.
  const boxes = await page.getByRole('checkbox').all()
  const labels = await Promise.all(
    boxes.map((box) => box.evaluate((el) => el.parentElement?.textContent ?? '')),
  )
  expect(labels.join(' ')).not.toMatch(/mitglied|nutzer|admin/i)
})
