import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import type pg from 'pg'
import { randomUUID } from 'node:crypto'
import { authConfig } from '@/server/auth/config'
import { isCounterRegression } from '@/server/auth/passkey'
import { generateSecret, hashSecret, verifySecret } from '@/server/auth/tokens'

/**
 * Signing into the operator console: a passkey, or a link by mail.
 *
 * The passkey is the way in that should be used, with the same WebAuthn rules
 * as the application's own -- discoverable credentials, user verification
 * required, the signature counter checked -- against tables of their own.
 *
 * The link by mail is the way back. A passkey is bound to its origin and to a
 * device, and an operator whose laptop is gone used to need somebody with a
 * shell on the server. It is weaker than a passkey, and shaped accordingly:
 * fifteen minutes, spent on first use, three per hour, and the same answer
 * whether or not the address belongs to an operator. Every sign-in through it
 * lands in the audit log, which is what makes the weaker door a visible one.
 */

export const OPERATOR_COOKIE = '__Host-gw_operator'
export const OPERATOR_COOKIE_PLAIN = 'gw_operator'
export const SESSION_HOURS = 8
export const IDLE_MINUTES = 30
const CHALLENGE_MS = 5 * 60_000
const LINK_MS = 15 * 60_000
/** Unspent links per operator per hour. The fourth request is answered with silence. */
const LINK_BURST = 3

export type Operator = { id: string; email: string; displayName: string }

type Db = Pick<pg.Pool, 'query'>

/** Where the console is served. Passkeys are bound to this origin. */
export function operatorOrigin(): string {
  return new URL(process.env.GW_OPERATOR_URL ?? authConfig.origin).origin
}

// ── Enrollment ───────────────────────────────────────────────────────────────

export async function peekEnrollment(db: Db, token: string): Promise<Operator | null> {
  const { rows } = await db.query(
    `select o.id, o.email, o.display_name from operator_enrollment e join operator o on o.id = e.operator_id
      where e.token_hash = $1 and e.used_at is null and e.expires_at > now() and o.disabled_at is null`,
    [hashSecret(token)],
  )
  return rows[0]
    ? { id: rows[0].id, email: rows[0].email, displayName: rows[0].display_name }
    : null
}

export async function enrollmentOptions(db: Db, token: string) {
  const operator = await peekEnrollment(db, token)
  if (!operator) return null
  const options = await generateRegistrationOptions({
    rpName: 'GoodWorkshop Operator',
    rpID: authConfig.rpId,
    userID: Buffer.from(operator.id),
    userName: operator.email,
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    attestationType: 'none',
  })
  await db.query(
    `insert into operator_challenge (challenge, operator_id, purpose, expires_at)
     values ($1, $2, 'registration', $3)`,
    [options.challenge, operator.id, new Date(Date.now() + CHALLENGE_MS)],
  )
  return options
}

/** Registers the passkey and spends the enrollment link, together. */
export async function completeEnrollment(
  db: Db,
  token: string,
  response: RegistrationResponseJSON,
): Promise<Operator | null> {
  const operator = await peekEnrollment(db, token)
  if (!operator) return null
  const challenge = challengeOf(response.response.clientDataJSON)

  const consumed = await db.query(
    `delete from operator_challenge
      where challenge = $1 and purpose = 'registration' and operator_id = $2 and expires_at > now()
      returning id`,
    [challenge, operator.id],
  )
  if (!consumed.rowCount) return null

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: operatorOrigin(),
    expectedRPID: authConfig.rpId,
    requireUserVerification: true,
  })
  if (!verification.verified || !verification.registrationInfo) return null
  const { credential } = verification.registrationInfo

  const spent = await db.query(
    `update operator_enrollment set used_at = now()
      where token_hash = $1 and used_at is null returning id`,
    [hashSecret(token)],
  )
  if (!spent.rowCount) return null

  await db.query(
    `insert into operator_credential (operator_id, credential_id, public_key, sign_count, transports)
     values ($1, $2, $3, $4, $5)`,
    [
      operator.id,
      credential.id,
      Buffer.from(credential.publicKey).toString('base64url'),
      credential.counter,
      credential.transports ?? [],
    ],
  )
  return operator
}

// ── Passkeys of a signed-in operator ─────────────────────────────────────────

export type Passkey = {
  credentialId: string
  createdAt: Date
  lastUsedAt: Date | null
}

export async function listPasskeys(db: Db, operatorId: string): Promise<Passkey[]> {
  const { rows } = await db.query(
    `select credential_id, created_at, last_used_at from operator_credential
      where operator_id = $1 order by created_at`,
    [operatorId],
  )
  return rows.map((row) => ({
    credentialId: row.credential_id,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  }))
}

/**
 * A second (or first) passkey for an operator who is already signed in.
 *
 * Enrollment through a one-time link covers the very first device, when nobody
 * can sign in yet. Afterwards this is the way: somebody who came in by mail
 * adds the passkey themselves, rather than asking for a shell on the server --
 * which is what made the mail link a replacement for the passkey instead of a
 * way back to one.
 *
 * The challenge is stored against this operator, so a challenge handed to one
 * cannot be answered into another's account. The credentials already on file
 * are excluded, so the same authenticator does not register twice and leave
 * two entries nobody can tell apart.
 */
export async function addPasskeyOptions(db: Db, operatorId: string) {
  const { rows } = await db.query(
    `select o.email, c.credential_id, c.transports from operator o
       left join operator_credential c on c.operator_id = o.id
      where o.id = $1 and o.disabled_at is null`,
    [operatorId],
  )
  if (!rows[0]) throw new Error('No such operator.')

  const options = await generateRegistrationOptions({
    rpName: 'GoodWorkshop Operator',
    rpID: authConfig.rpId,
    userID: Buffer.from(operatorId),
    userName: rows[0].email,
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    attestationType: 'none',
    excludeCredentials: rows
      .filter((row) => row.credential_id)
      .map((row) => ({ id: row.credential_id, transports: row.transports })),
  })
  await db.query(
    `insert into operator_challenge (challenge, operator_id, purpose, expires_at)
     values ($1, $2, 'registration', $3)`,
    [options.challenge, operatorId, new Date(Date.now() + CHALLENGE_MS)],
  )
  return options
}

/** Registers the passkey against the operator the challenge was issued for. */
export async function addPasskey(
  db: Db,
  operatorId: string,
  response: RegistrationResponseJSON,
): Promise<boolean> {
  const challenge = challengeOf(response.response.clientDataJSON)
  const consumed = await db.query(
    `delete from operator_challenge
      where challenge = $1 and purpose = 'registration' and operator_id = $2 and expires_at > now()
      returning id`,
    [challenge, operatorId],
  )
  if (!consumed.rowCount) return false

  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: operatorOrigin(),
    expectedRPID: authConfig.rpId,
    requireUserVerification: true,
  })
  if (!verification.verified || !verification.registrationInfo) return false
  const { credential } = verification.registrationInfo

  await db.query(
    `insert into operator_credential (operator_id, credential_id, public_key, sign_count, transports)
     values ($1, $2, $3, $4, $5)`,
    [
      operatorId,
      credential.id,
      Buffer.from(credential.publicKey).toString('base64url'),
      credential.counter,
      credential.transports ?? [],
    ],
  )
  await db.query(
    `insert into operator_audit (operator_id, action, detail) values ($1, 'passkey_added', $2)`,
    [operatorId, JSON.stringify({ credentialId: credential.id })],
  )
  return true
}

/**
 * Removes one of this operator's own passkeys.
 *
 * Scoped by operator in the statement itself: holding a session is not holding
 * everybody's passkeys. Removing the last one is allowed -- the link by mail
 * always remains, so nobody can lock themselves out this way.
 */
export async function removePasskey(
  db: Db,
  operatorId: string,
  credentialId: string,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `delete from operator_credential where operator_id = $1 and credential_id = $2`,
    [operatorId, credentialId],
  )
  if (!rowCount) return false

  await db.query(
    `insert into operator_audit (operator_id, action, detail) values ($1, 'passkey_removed', $2)`,
    [operatorId, JSON.stringify({ credentialId })],
  )
  return true
}

// ── Sign-in ──────────────────────────────────────────────────────────────────

export async function signInOptions(db: Db) {
  const options = await generateAuthenticationOptions({
    rpID: authConfig.rpId,
    userVerification: 'required',
  })
  await db.query(
    `insert into operator_challenge (challenge, purpose, expires_at) values ($1, 'authentication', $2)`,
    [options.challenge, new Date(Date.now() + CHALLENGE_MS)],
  )
  return options
}

export async function verifySignIn(
  db: Db,
  response: AuthenticationResponseJSON,
): Promise<Operator | null> {
  const challenge = challengeOf(response.response.clientDataJSON)
  const consumed = await db.query(
    `delete from operator_challenge
      where challenge = $1 and purpose = 'authentication' and expires_at > now() returning id`,
    [challenge],
  )
  if (!consumed.rowCount) return null

  const { rows } = await db.query(
    `select c.credential_id, c.public_key, c.sign_count, c.transports, o.id, o.email, o.display_name
       from operator_credential c join operator o on o.id = c.operator_id
      where c.credential_id = $1 and o.disabled_at is null`,
    [response.id],
  )
  const found = rows[0]
  if (!found) return null

  const verification = await verifyAuthenticationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: operatorOrigin(),
    expectedRPID: authConfig.rpId,
    credential: {
      id: found.credential_id,
      publicKey: new Uint8Array(Buffer.from(found.public_key, 'base64url')),
      counter: Number(found.sign_count),
      transports: found.transports,
    },
    requireUserVerification: true,
  })
  if (!verification.verified) return null
  if (
    isCounterRegression({
      stored: Number(found.sign_count),
      presented: verification.authenticationInfo.newCounter,
    })
  ) {
    return null
  }

  await db.query(
    `update operator_credential set sign_count = $2, last_used_at = now() where credential_id = $1`,
    [found.credential_id, verification.authenticationInfo.newCounter],
  )
  return { id: found.id, email: found.email, displayName: found.display_name }
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function createOperatorSession(db: Db, operatorId: string, ip: string | null) {
  const id = randomUUID()
  const secret = generateSecret(32)
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000)
  await db.query(
    `insert into operator_session (id, operator_id, secret_hash, ip, expires_at) values ($1, $2, $3, $4, $5)`,
    [id, operatorId, hashSecret(secret), ip, expiresAt],
  )
  return { value: `${id}.${secret}`, expiresAt }
}

/** A session value to its operator: unexpired, not idle, not revoked, operator not disabled. */
export async function verifyOperatorSession(db: Db, value: string): Promise<Operator | null> {
  const dot = value.indexOf('.')
  if (dot < 0) return null
  const id = value.slice(0, dot)
  const secret = value.slice(dot + 1)
  if (!/^[0-9a-f-]{36}$/.test(id)) return null

  const { rows } = await db.query(
    `select s.secret_hash, o.id, o.email, o.display_name
       from operator_session s join operator o on o.id = s.operator_id
      where s.id = $1 and s.revoked_at is null and s.expires_at > now()
        and s.last_seen_at > now() - make_interval(mins => $2) and o.disabled_at is null`,
    [id, IDLE_MINUTES],
  )
  const row = rows[0]
  if (!row || !verifySecret(secret, row.secret_hash)) return null

  await db.query(`update operator_session set last_seen_at = now() where id = $1`, [id])
  return { id: row.id, email: row.email, displayName: row.display_name }
}

export async function revokeOperatorSession(db: Db, value: string) {
  const id = value.slice(0, value.indexOf('.'))
  if (/^[0-9a-f-]{36}$/.test(id)) {
    await db.query(`update operator_session set revoked_at = now() where id = $1`, [id])
  }
}

function challengeOf(clientDataJSON: string): string {
  return (
    JSON.parse(Buffer.from(clientDataJSON, 'base64url').toString('utf8')) as { challenge: string }
  ).challenge
}

// ── Signing in by mail ───────────────────────────────────────────────────────

/**
 * Issues a sign-in link, or nothing at all.
 *
 * Null covers every refusal: an address that belongs to nobody, a disabled
 * operator, too many unspent links. The console has no sign-up, so an answer
 * that distinguishes them is an answer that says who the operators are.
 */
export async function requestSignInLink(
  db: Db,
  email: string,
): Promise<{ operator: Operator; token: string } | null> {
  const { rows } = await db.query(
    `select id, email, display_name from operator
      where lower(email) = lower($1) and disabled_at is null`,
    [email.trim()],
  )
  const found = rows[0]
  if (!found) return null

  const recent = await db.query(
    `select count(*)::int as n from operator_login
      where operator_id = $1 and used_at is null and requested_at > now() - interval '1 hour'`,
    [found.id],
  )
  if ((recent.rows[0]?.n ?? 0) >= LINK_BURST) return null

  const token = generateSecret(32)
  await db.query(
    `insert into operator_login (operator_id, token_hash, expires_at) values ($1, $2, $3)`,
    [found.id, hashSecret(token), new Date(Date.now() + LINK_MS)],
  )
  return {
    operator: { id: found.id, email: found.email, displayName: found.display_name },
    token,
  }
}

/**
 * Looks at a sign-in link without spending it.
 *
 * Because whoever fetches the link first is usually not a person. Microsoft
 * Defender's Safe Links opens every URL in a Microsoft 365 mailbox before it
 * is delivered, so a link spent on GET is spent by the scanner, and the
 * operator arrives to "already used" -- every time, for every new link. The
 * page therefore only looks, and the button spends: a scanner fetches, it does
 * not submit forms. The application's own magic link was fixed the same way.
 */
export async function peekSignInLink(db: Db, token: string): Promise<Operator | null> {
  const { rows } = await db.query(
    `select o.id, o.email, o.display_name from operator_login l join operator o on o.id = l.operator_id
      where l.token_hash = $1 and l.used_at is null and l.expires_at > now() and o.disabled_at is null`,
    [hashSecret(token)],
  )
  return rows[0]
    ? { id: rows[0].id, email: rows[0].email, displayName: rows[0].display_name }
    : null
}

/**
 * Spends a sign-in link: one use, and the operator behind it.
 *
 * The update carries the conditions, so two requests with the same token
 * cannot both win -- the second one updates no row and gets nothing.
 */
export async function spendSignInLink(db: Db, token: string): Promise<Operator | null> {
  const { rows } = await db.query(
    `update operator_login l set used_at = now()
       from operator o
      where l.operator_id = o.id
        and l.token_hash = $1
        and l.used_at is null
        and l.expires_at > now()
        and o.disabled_at is null
      returning o.id, o.email, o.display_name`,
    [hashSecret(token)],
  )
  const found = rows[0]
  if (!found) return null

  await db.query(
    `insert into operator_audit (operator_id, action, detail) values ($1, 'sign_in_mail', $2)`,
    [found.id, JSON.stringify({ email: found.email })],
  )
  return { id: found.id, email: found.email, displayName: found.display_name }
}
