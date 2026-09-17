import { randomUUID } from 'node:crypto'
import { and, count, eq, gt } from 'drizzle-orm'
import { sql } from 'drizzle-orm'
import { pgTable, text, timestamp, uuid, jsonb } from 'drizzle-orm/pg-core'
import { withAuth, withTenantOnly, withoutTenant } from '@/server/db'
import { identity } from '@/server/db/schema'
import { authConfig } from '@/server/auth/config'
import { generateSecret, hashSecret } from '@/server/auth/tokens'
import { sendMail, type Mail } from '@/server/auth/mail'
import { translator } from '@/i18n/translator'
import type { Locale } from '@/i18n/config'
import { ATTRIBUTION_TEXT } from '@/lib/attribution'
import { seedBuiltinModuleTypes } from '@/domain/moduleType/seed'
import { PLATFORM_TENANT } from '@/server/edition/cloud'
import { TRIAL_DAYS } from '@/cloud/billing/plans'
import { readLegalDocument } from '@/cloud/legal/documents'
import type { Signup } from './rules'
import type { VatCheck } from '@/cloud/tax/vies'

/**
 * Registering for the cloud, in two steps: the form asks for a link, the link
 * creates the workspace.
 *
 * Nothing but a pending row exists before the address has been confirmed, so a
 * typo or a stranger's address costs a row that expires, not an account. And
 * the form answers the same whether or not the address already belongs to
 * somebody: that person gets a mail saying so, the page says "check your
 * inbox" either way.
 */

/** drizzle-cloud/0003_registration.sql. Declared here: the community schema does not have it. */
const pendingSignup = pgTable('pending_signup', {
  id: uuid('id').primaryKey(),
  tokenHash: text('token_hash').notNull(),
  email: text('email').notNull(),
  payload: jsonb('payload').notNull(),
  requestedIp: text('requested_ip'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
})

const LINK_TTL_HOURS = 24
/** Confirmation mails one address may be sent within an hour. */
const BURST = 3

export async function requestSignup(
  signup: Signup,
  locale: Locale,
  meta: { ip?: string; vatCheck?: VatCheck } = {},
): Promise<void> {
  const secret = generateSecret(32)

  const outcome = await withAuth(async (tx) => {
    const recent = await tx
      .select({ n: count() })
      .from(pendingSignup)
      .where(
        and(
          eq(pendingSignup.email, signup.email),
          gt(pendingSignup.createdAt, new Date(Date.now() - 60 * 60_000)),
        ),
      )
    if ((recent[0]?.n ?? 0) >= BURST) return 'limited' as const

    const existing = await tx
      .select({ id: identity.id })
      .from(identity)
      .where(eq(identity.email, signup.email))
      .limit(1)

    await tx.insert(pendingSignup).values({
      id: randomUUID(),
      tokenHash: hashSecret(secret),
      email: signup.email,
      payload: {
        ...signup,
        locale,
        trialDays: TRIAL_DAYS,
        ...(meta.vatCheck ? { vatCheck: meta.vatCheck } : {}),
      },
      requestedIp: meta.ip ?? null,
      expiresAt: new Date(Date.now() + LINK_TTL_HOURS * 60 * 60_000),
    })
    return existing[0] ? ('known' as const) : ('new' as const)
  })

  if (outcome === 'limited') return

  // A known address gets told it already has an account -- the row above still
  // counts towards the limit, so this cannot be used to fill an inbox either.
  const mail =
    outcome === 'known'
      ? accountExistsMail(signup.email, locale)
      : confirmSignupMail(
          signup.email,
          new URL(`/registrieren/bestaetigen?token=${secret}`, authConfig.appUrl).toString(),
          locale,
        )
  await sendMail(mail, PLATFORM_TENANT)
}

/** Whether a confirmation token would still be accepted, without spending it. */
export async function peekSignup(token: string): Promise<boolean> {
  const rows = await withAuth((tx) =>
    tx
      .select({ id: pendingSignup.id })
      .from(pendingSignup)
      .where(
        and(
          eq(pendingSignup.tokenHash, hashSecret(token)),
          sql`${pendingSignup.consumedAt} is null`,
          gt(pendingSignup.expiresAt, new Date()),
        ),
      )
      .limit(1),
  )
  return rows.length > 0
}

export type CompletedSignup =
  { outcome: 'created'; tenantId: string; identityId: string } | { outcome: 'exists' | 'invalid' }

/** Spends the link and creates the workspace -- see app.cloud_complete_signup. */
export async function completeSignup(token: string): Promise<CompletedSignup> {
  const result = await withoutTenant((tx) =>
    tx.execute(
      sql`select tenant_id, identity_id, outcome from app.cloud_complete_signup(${hashSecret(token)})`,
    ),
  )
  const row = (
    result as unknown as {
      rows: { tenant_id: string | null; identity_id: string | null; outcome: string }[]
    }
  ).rows[0]

  if (row?.outcome !== 'created' || !row.tenant_id || !row.identity_id) {
    return { outcome: row?.outcome === 'exists' ? 'exists' : 'invalid' }
  }

  await withTenantOnly(row.tenant_id, (tx) => seedBuiltinModuleTypes(tx, row.tenant_id!))
  return { outcome: 'created', tenantId: row.tenant_id, identityId: row.identity_id }
}

/**
 * The confirmation of the contract, with the terms as they were agreed: in the
 * mail as text rather than behind a link to a page that can change.
 */
export async function sendWelcome(to: string, locale: Locale): Promise<void> {
  const t = translator(locale, 'mail.signupWelcome')
  const texts = [await readLegalDocument('agb')]
  const mail: Mail = {
    to,
    subject: t('subject'),
    text: [
      t('body', { days: TRIAL_DAYS, link: new URL('/library', authConfig.appUrl).toString() }),
      '',
      ...texts.flatMap((source) => ['─'.repeat(72), '', stripComments(source), '']),
      ATTRIBUTION_TEXT,
    ].join('\n'),
  }
  await sendMail(mail, PLATFORM_TENANT)
}

/** Notes for editors are whole lines, the same rule the page renderer applies. */
const stripComments = (source: string) =>
  source
    .split('\n')
    .filter((line) => !(line.trim().startsWith('<!--') && line.trim().endsWith('-->')))
    .join('\n')
    .trim()

function confirmSignupMail(to: string, link: string, locale: Locale): Mail {
  const t = translator(locale, 'mail.signupConfirm')
  return {
    to,
    subject: t('subject'),
    text: [t('body', { link, hours: LINK_TTL_HOURS }), '', ATTRIBUTION_TEXT].join('\n'),
  }
}

function accountExistsMail(to: string, locale: Locale): Mail {
  const t = translator(locale, 'mail.signupExists')
  return {
    to,
    subject: t('subject'),
    text: [
      t('body', { link: new URL('/login', authConfig.appUrl).toString() }),
      '',
      ATTRIBUTION_TEXT,
    ].join('\n'),
  }
}
