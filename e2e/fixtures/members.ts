import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'

/**
 * A second, third person in the workspace -- an ordinary member, not an admin.
 *
 * The signed-in session of the suite belongs to an admin (auth.setup.ts makes
 * one), and an admin holds a role on everything. A test about who may see what
 * is therefore only worth something from a member's browser, and the member
 * gets there the way a real one does: invited on the members screen, signed in
 * through the link that screen shows when no mail relay is configured.
 */

export type Member = { email: string; page: Page; context: BrowserContext }

/** Invites somebody as the admin on `admin` and returns the link to hand on. */
export async function inviteMember(
  admin: Page,
  person: { firstName: string; lastName: string; email: string },
): Promise<string> {
  await admin.goto('/admin/members')
  await admin.getByRole('button', { name: 'Mitglied einladen' }).click()
  await admin.getByLabel('Vorname').fill(person.firstName)
  await admin.getByLabel('Nachname').fill(person.lastName)
  await admin.getByLabel('E-Mail-Adresse').fill(person.email)
  await admin.getByRole('button', { name: 'Einladen', exact: true }).click()

  const link = (await admin.getByText(/\/verify\?token=/).innerText()).trim()
  expect(link).toContain('/verify?token=')
  return link
}

/**
 * A browser of their own, signed in through the invitation.
 *
 * `storageState: undefined` explicitly: the `browser` fixture inherits the
 * project's options, so a plain newContext() would start out with the ADMIN's
 * session -- and every refusal asserted afterwards would be the admin's.
 */
export async function signInAs(browser: Browser, email: string, link: string): Promise<Member> {
  const context = await browser.newContext({ storageState: undefined })
  const page = await context.newPage()
  await page.goto(link)
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
  await page.waitForURL((url) => !url.pathname.startsWith('/verify'))
  return { email, page, context }
}
