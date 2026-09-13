import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { expect, test as setup } from '@playwright/test'
import { STORAGE_STATE } from './paths'

/**
 * Signs in once and stores the session for the authenticated tests.
 *
 * Deliberately through the CLI rather than through a test-only backdoor: this
 * is the exact path an operator uses on an install with no HTTPS and no SMTP,
 * so the tests exercise it every run instead of letting it rot.
 */
setup('authenticate', async ({ page, baseURL }) => {
  const email = process.env.E2E_EMAIL ?? 'e2e@example.test'

  execFileSync('node', ['scripts/cli.mjs', 'admin', 'create', '--email', email], {
    env: { ...process.env, GW_APP_URL: baseURL },
    stdio: 'pipe',
  })

  const output = execFileSync('node', ['scripts/cli.mjs', 'login-link', '--email', email], {
    env: { ...process.env, GW_APP_URL: baseURL },
    encoding: 'utf8',
  })

  const link = /https?:\/\/\S+/.exec(output)?.[0]
  expect(link, 'the CLI must print a login link').toBeTruthy()

  // Twice before anybody clicks, the way a mail scanner and a link preview get
  // to it first. Opening the link must not spend it -- only the button does.
  await page.goto(link!)
  await page.goto(link!)
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/verify'))
  await page.goto('/library')
  await expect(page.getByRole('heading', { name: 'Workshops' })).toBeVisible()

  mkdirSync(dirname(STORAGE_STATE), { recursive: true })
  await page.context().storageState({ path: STORAGE_STATE })
  expect(existsSync(STORAGE_STATE)).toBe(true)
})
