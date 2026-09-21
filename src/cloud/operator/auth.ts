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
