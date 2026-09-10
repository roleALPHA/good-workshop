import { randomUUID } from 'node:crypto'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import { and, eq, gt, sql } from 'drizzle-orm'
import { withAuth } from '@/server/db'
import { identity, webauthnChallenge, webauthnCredential } from '@/server/db/schema'
import { authConfig } from './config'

/**
 * WebAuthn passkeys.
 *
 * Challenges live in the database rather than in a cookie or in memory: they
 * must be single-use and server-verified, and an app that runs as more than one
 * container cannot keep them in process memory.
 *
 * Note the hard constraint this whole path carries: browsers refuse WebAuthn on
 * plain http outside localhost. An install without TLS has no passkeys at all,
 * which is why magic links are a full second route.
 */

const CHALLENGE_TTL_MS = 5 * 60_000

async function storeChallenge(
  challenge: string,
  purpose: 'registration' | 'authentication',
  identityId: string | null,
): Promise<void> {
  await withAuth((tx) =>
    tx.insert(webauthnChallenge).values({
      id: randomUUID(),
      challenge,
      identityId,
      purpose,
      expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
    }),
  )
}

/** Consumes a challenge, once. The delete is the check. */
async function consumeChallenge(
  challenge: string,
  purpose: 'registration' | 'authentication',
): Promise<{ identityId: string | null } | null> {
  return withAuth(async (tx) => {
    const deleted = await tx
      .delete(webauthnChallenge)
      .where(
        and(
          eq(webauthnChallenge.challenge, challenge),
          eq(webauthnChallenge.purpose, purpose),
          gt(webauthnChallenge.expiresAt, new Date()),
        ),
      )
      .returning({ identityId: webauthnChallenge.identityId })
    return deleted[0] ?? null
  })
}

export async function registrationOptions(identityId: string, email: string) {
  const existing = await withAuth((tx) =>
    tx
      .select({ id: webauthnCredential.credentialId, transports: webauthnCredential.transports })
      .from(webauthnCredential)
      .where(eq(webauthnCredential.identityId, identityId)),
  )

  const options = await generateRegistrationOptions({
    rpName: authConfig.rpName,
    rpID: authConfig.rpId,
    userID: Buffer.from(identityId),
    userName: email,
    // Discoverable credentials, so signing in needs no username first: the
    // browser offers the passkey and we learn who it is from the response.
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    attestationType: 'none',
    // Stops a second passkey being registered for the same authenticator.
    excludeCredentials: existing.map((c) => ({ id: c.id, transports: c.transports as never })),
  })

  await storeChallenge(options.challenge, 'registration', identityId)
  return options
}

export async function verifyRegistration(
  identityId: string,
  response: RegistrationResponseJSON,
  nickname: string,
): Promise<boolean> {
  const clientData = JSON.parse(
    Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8'),
  ) as { challenge: string }

  const stored = await consumeChallenge(clientData.challenge, 'registration')
  if (!stored || stored.identityId !== identityId) return false

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: clientData.challenge,
    expectedOrigin: authConfig.origin,
    expectedRPID: authConfig.rpId,
    requireUserVerification: false,
  })

  if (!verification.verified || !verification.registrationInfo) return false
  const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

  await withAuth((tx) =>
    tx.insert(webauthnCredential).values({
      id: randomUUID(),
      identityId,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      signCount: credential.counter,
      transports: (credential.transports ?? []) as string[],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      nickname,
    }),
  )
  return true
}

export async function authenticationOptions() {
  const options = await generateAuthenticationOptions({
    rpID: authConfig.rpId,
    userVerification: 'preferred',
  })
  await storeChallenge(options.challenge, 'authentication', null)
  return options
}

export type PasskeyLogin = { identityId: string; email: string }

export async function verifyAuthentication(
  response: AuthenticationResponseJSON,
): Promise<PasskeyLogin | null> {
  const clientData = JSON.parse(
    Buffer.from(response.response.clientDataJSON, 'base64url').toString('utf8'),
  ) as { challenge: string }

  const stored = await consumeChallenge(clientData.challenge, 'authentication')
  if (!stored) return null

  return withAuth(async (tx) => {
    const rows = await tx
      .select({
        credentialId: webauthnCredential.credentialId,
        publicKey: webauthnCredential.publicKey,
        signCount: webauthnCredential.signCount,
        transports: webauthnCredential.transports,
        identityId: webauthnCredential.identityId,
        email: identity.email,
        status: identity.status,
      })
      .from(webauthnCredential)
      .innerJoin(identity, eq(identity.id, webauthnCredential.identityId))
      .where(eq(webauthnCredential.credentialId, response.id))
      .limit(1)

    const found = rows[0]
    if (!found || found.status !== 'active') return null

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: clientData.challenge,
      expectedOrigin: authConfig.origin,
      expectedRPID: authConfig.rpId,
      credential: {
        id: found.credentialId,
        publicKey: new Uint8Array(Buffer.from(found.publicKey, 'base64url')),
        counter: Number(found.signCount),
        transports: found.transports as never,
      },
      requireUserVerification: false,
    })

    if (!verification.verified) return null

    // The counter is the only cloning signal WebAuthn gives us. Many modern
    // authenticators keep it at zero, so this is recorded rather than enforced.
    await tx
      .update(webauthnCredential)
      .set({ signCount: verification.authenticationInfo.newCounter, lastUsedAt: sql`now()` })
      .where(eq(webauthnCredential.credentialId, found.credentialId))

    await tx
      .update(identity)
      .set({ lastLoginAt: sql`now()` })
      .where(eq(identity.id, found.identityId))

    return { identityId: found.identityId, email: found.email }
  })
}
