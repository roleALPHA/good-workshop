import { expect, test, type Page } from '@playwright/test'

/**
 * A tenant's mark on their own installation.
 *
 * The refusals are the interesting half. A brand colour that cannot carry the
 * interface has to be rejected while somebody is looking at a form, never
 * discovered later as a page nobody can read -- and an SVG with a script in it
 * has to be rejected outright rather than cleaned.
 */

test.describe.configure({ mode: 'serial' })

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 32">
  <rect width="32" height="32" rx="7" fill="#0d7a5f"/>
  <text x="40" y="22" font-size="16" fill="#0d7a5f">Nordwind</text>
</svg>`

test('takes a logo and an accent colour, and shows both', async ({ page }) => {
  await page.goto('/admin/branding')

  await page.setInputFiles('input[type=file]', {
    name: 'logo.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(LOGO),
  })
  await expect(page.getByRole('button', { name: 'Logo ersetzen' })).toBeVisible()

  await page.getByLabel('Hex-Wert').fill('#0d7a5f')
  await page.getByLabel('Name (wenn kein Logo gesetzt ist)').click()
  await expect(page.getByText('Gespeichert.')).toBeVisible()

  // The mark reaches every view, including the one that has no session yet.
  await page.goto('/library')
  await expect(page.getByRole('img', { name: 'Logo' })).toBeVisible()

  // And the accent really is the tenant's, not the default violet.
  const accent = await page
    .getByRole('button', { name: 'Neuer Workshop' })
    .evaluate((el) => getComputedStyle(el).backgroundColor)
  expect(accent).not.toBe('')
  // Green, not the violet the stylesheet ships with.
  const hue = await hueOf(page)
  expect(hue).toBeGreaterThan(120)
  expect(hue).toBeLessThan(200)
})

test('refuses a colour it cannot build a readable ramp from', async ({ page }) => {
  await page.goto('/admin/branding')
  await page.getByLabel('Hex-Wert').fill('#888888')
  await page.getByLabel('Name (wenn kein Logo gesetzt ist)').click()

  // Asserted on the text, not on role=alert: Next puts an always-present,
  // always-empty route announcer with that role on every page, so the role
  // alone is satisfied by something that says nothing.
  await expect(page.getByText(/Grau hat keinen Farbton/)).toBeVisible()
})

test('refuses an SVG that carries a script', async ({ page }) => {
  await page.goto('/admin/branding')
  await page.setInputFiles('input[type=file]', {
    name: 'böse.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("https://evil.test")</script></svg>',
    ),
  })

  // Refused, not cleaned: the upload comes from somebody with a lot of
  // authority in their own tenant and none at all over other people's browsers.
  await expect(page.getByText(/enthält <script>/)).toBeVisible()
})

test('puts the default back', async ({ page }) => {
  // Cleanup as a test, not as a hook.
  //
  // This spec writes to the one tenant row every other spec renders against,
  // so leaving a brand behind poisons every later run. A hook that quietly
  // does not run -- which is exactly what happened here -- leaves no trace;
  // a test that fails is a red suite, which is the honest outcome. Serial
  // mode is what makes this the last thing to happen.
  await page.goto('/admin/branding')

  await page.getByRole('button', { name: 'Entfernen' }).click()
  await expect(page.getByRole('button', { name: 'Logo hochladen' })).toBeVisible()

  await page.getByLabel('Hex-Wert').fill('')
  await page.getByLabel('Name (wenn kein Logo gesetzt ist)').click()
  await expect(page.getByText('Gespeichert.')).toBeVisible()

  await page.goto('/library')
  await expect(page.getByRole('img', { name: 'Logo' })).toHaveCount(0)

  // Asserted as the ABSENCE of a tenant style block rather than as a
  // particular hue. BrandStyle renders nothing at all when no colour is set,
  // so this is the exact property, and it survives somebody legitimately
  // changing the shipped default.
  //
  // It used to compare the hue against the public demo page, which emitted no
  // such block either and no longer exists.
  const injected = await page.evaluate(() =>
    [...document.querySelectorAll('style')].some((el) => el.textContent?.includes('--brand-h')),
  )
  expect(injected, 'kein Tenant-Stilblock mehr im Dokument').toBe(false)

  // And the page still resolves the shipped ramp, rather than falling back to
  // an unstyled document.
  expect(Number.isFinite(await hueOf(page))).toBe(true)
})

const hueOf = (page: Page) =>
  page.evaluate(() =>
    Number(getComputedStyle(document.documentElement).getPropertyValue('--brand-h').trim()),
  )
