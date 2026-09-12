import { expect, test } from '@playwright/test'

/**
 * Enrolling a passkey, with a virtual authenticator.
 *
 * Chrome's WebAuthn automation lets this run without a real fingerprint
 * reader -- and it is worth running, because the two halves of the dance are
 * easy to wire up in a way that typechecks and never completes: a challenge
 * that is never consumed, an origin that does not match, a response the server
 * quietly rejects.
 *
 * Signing IN with the passkey afterwards is not asserted here. That path has
 * its own coverage, and the point of this file is the half that did not exist
 * at all until now.
 */

test('creates a passkey and lists it, then removes it again', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Der virtuelle Authenticator ist Chrome-spezifisch')

  const client = await page.context().newCDPSession(page)
  await client.send('WebAuthn.enable')
  const { authenticatorId } = await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      // The server asks for user verification and refuses a credential that
      // cannot supply it -- so the virtual device has to be able to.
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })

  await page.goto('/settings/passkeys')
  await expect(page.getByRole('heading', { name: 'Passkeys' })).toBeVisible()

  await page.getByLabel('Name (optional)').fill('Testgerät')
  await page.getByRole('button', { name: 'Passkey anlegen' }).click()

  // The page reloads itself once the credential is stored.
  await expect(page.getByText('Testgerät')).toBeVisible({ timeout: 15_000 })

  // And it really is on the account, not just on screen.
  const stored = await client.send('WebAuthn.getCredentials', { authenticatorId })
  expect(stored.credentials.length).toBe(1)

  await page.getByRole('button', { name: 'Testgerät entfernen' }).click()
  await expect(page.getByText('Testgerät')).toHaveCount(0)

  await client.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId })
})
