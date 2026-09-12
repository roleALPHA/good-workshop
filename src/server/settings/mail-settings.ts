import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Tx } from '@/server/db'
import { tenant } from '@/server/db/schema'
import { decryptSecret, encryptSecret } from './secretbox'

/**
 * Mail configuration, configurable in the browser instead of in a .env.
 *
 * WHY THE ENVIRONMENT STILL WINS. An install that already sets GW_MAIL_TRANSPORT
 * keeps working exactly as before, and the form shows those fields as fixed
 * rather than pretending to accept a value it would then ignore. Silently
 * overriding either direction is how somebody spends an afternoon wondering why
 * their change did nothing.
 *
 * WHERE IT LIVES. In `tenant.settings`, not in a table of its own. That column
 * already exists, it is under the same tenant RLS as everything else, and in
 * Cloud -- where mail genuinely differs per tenant -- it is the correct shape.
 * A settings table without a tenant_id would be the one table in this schema
 * outside the wall, which is exactly the kind of exception that gets forgotten.
 *
 * The two credentials are encrypted (see secretbox.ts); everything else is
 * plain, because a sender address in a backup harms nobody.
 */

export const MAIL_TRANSPORTS = ['smtp', 'graph', 'console', 'none'] as const
export type MailTransport = (typeof MAIL_TRANSPORTS)[number]

/** What an operator may set. Secrets are write-only from the form's side: the
 *  stored value is never sent back to the browser, only whether there is one. */
export const mailSettingsInput = z.object({
  transport: z.enum(MAIL_TRANSPORTS),
  smtpUrl: z.string().trim().max(2000).optional(),
  smtpFrom: z.string().trim().max(320).optional(),
  graphTenantId: z.string().trim().max(200).optional(),
  graphClientId: z.string().trim().max(200).optional(),
  graphClientSecret: z.string().trim().max(2000).optional(),
  graphSender: z.string().trim().max(320).optional(),
})

export type MailSettingsInput = z.infer<typeof mailSettingsInput>

/** The resolved configuration the mail transport actually uses. */
export type MailConfig = {
  transport: MailTransport
  smtpUrl?: string
  smtpFrom?: string
  graphTenantId?: string
  graphClientId?: string
  graphClientSecret?: string
  graphSender?: string
  /** Which fields the environment dictates, so the form can say so. */
  fromEnvironment: string[]
}

const SECRET_FIELDS = ['smtpUrl', 'graphClientSecret'] as const
type SecretField = (typeof SECRET_FIELDS)[number]

/** The shape inside tenant.settings.mail. Secrets sit in an envelope so a
 *  glance at the row shows which values are protected and which are not. */
const storedMail = z
  .object({
    transport: z.enum(MAIL_TRANSPORTS).optional(),
    smtpUrl: z.object({ enc: z.string() }).optional(),
    smtpFrom: z.string().optional(),
    graphTenantId: z.string().optional(),
    graphClientId: z.string().optional(),
    graphClientSecret: z.object({ enc: z.string() }).optional(),
    graphSender: z.string().optional(),
  })
  .partial()

export type StoredMail = z.infer<typeof storedMail>

export async function readStoredMail(tx: Tx, tenantId: string): Promise<StoredMail> {
  const rows = await tx
    .select({ settings: tenant.settings })
    .from(tenant)
    .where(eq(tenant.id, tenantId))
    .limit(1)

  const parsed = storedMail.safeParse(
    (rows[0]?.settings as Record<string, unknown> | undefined)?.mail ?? {},
  )
  // A settings blob that does not parse is treated as absent rather than fatal:
  // it must not be able to lock everybody out of an install.
  return parsed.success ? parsed.data : {}
}

/**
 * Merges stored settings with the environment, environment first.
 *
 * Decryption failures are contained here: a restored dump meeting a different
 * key leaves the credential empty and the transport intact, so the operator
 * sees "no password configured" and can re-enter it -- rather than a stack
 * trace on the login page.
 */
export type MailEnv = Partial<
  Record<
    | 'GW_MAIL_TRANSPORT'
    | 'SMTP_URL'
    | 'SMTP_FROM'
    | 'GW_GRAPH_TENANT_ID'
    | 'GW_GRAPH_CLIENT_ID'
    | 'GW_GRAPH_CLIENT_SECRET'
    | 'GW_GRAPH_SENDER',
    string
  >
>

export function resolveMailConfig(stored: StoredMail, env: MailEnv): MailConfig {
  const fromEnvironment: string[] = []

  const pick = <T extends string>(
    field: string,
    envValue: string | undefined,
    storedValue: T | undefined,
  ): T | undefined => {
    if (envValue) {
      fromEnvironment.push(field)
      return envValue as T
    }
    return storedValue
  }

  const secret = (field: SecretField, envValue: string | undefined): string | undefined => {
    if (envValue) {
      fromEnvironment.push(field)
      return envValue
    }
    const envelope = stored[field]?.enc
    if (!envelope) return undefined
    try {
      return decryptSecret(envelope)
    } catch {
      return undefined
    }
  }

  return {
    transport: pick('transport', env.GW_MAIL_TRANSPORT, stored.transport) ?? 'none',
    smtpUrl: secret('smtpUrl', smtpUrlFromEnv(env)),
    smtpFrom: pick('smtpFrom', env.SMTP_FROM, stored.smtpFrom),
    graphTenantId: pick('graphTenantId', env.GW_GRAPH_TENANT_ID, stored.graphTenantId),
    graphClientId: pick('graphClientId', env.GW_GRAPH_CLIENT_ID, stored.graphClientId),
    graphClientSecret: secret('graphClientSecret', env.GW_GRAPH_CLIENT_SECRET),
    graphSender: pick('graphSender', env.GW_GRAPH_SENDER, stored.graphSender),
    fromEnvironment,
  }
}

/** SMTP_URL_FILE and GW_GRAPH_CLIENT_SECRET_FILE are resolved by the caller in
 *  mail.ts; here only the direct variables are consulted, so this stays a pure
 *  function that tests can drive with a plain object. */
function smtpUrlFromEnv(env: MailEnv): string | undefined {
  return env.SMTP_URL || undefined
}

/**
 * Applies a form submission to the stored blob.
 *
 * An empty secret means "leave it alone", never "delete it": the form cannot
 * show the current value, so a blank field is what an operator submits when
 * they changed the sender address and nothing else. Clearing is its own,
 * explicit action.
 */
export function applyMailSettings(stored: StoredMail, input: MailSettingsInput): StoredMail {
  const next: StoredMail = { ...stored, transport: input.transport }

  for (const field of ['smtpFrom', 'graphTenantId', 'graphClientId', 'graphSender'] as const) {
    const value = input[field]
    if (value !== undefined) next[field] = value || undefined
  }

  for (const field of SECRET_FIELDS) {
    const value = input[field]
    if (value) next[field] = { enc: encryptSecret(value) }
  }

  return next
}

export async function writeStoredMail(tx: Tx, tenantId: string, mail: StoredMail): Promise<void> {
  const rows = await tx
    .select({ settings: tenant.settings })
    .from(tenant)
    .where(eq(tenant.id, tenantId))
    .limit(1)

  const settings = (rows[0]?.settings as Record<string, unknown> | undefined) ?? {}
  await tx
    .update(tenant)
    .set({ settings: { ...settings, mail } })
    .where(eq(tenant.id, tenantId))
}

/** What the form may show: never a credential, only whether one is stored. */
export function describeMailSettings(stored: StoredMail, config: MailConfig) {
  return {
    transport: config.transport,
    smtpFrom: config.smtpFrom ?? '',
    graphTenantId: config.graphTenantId ?? '',
    graphClientId: config.graphClientId ?? '',
    graphSender: config.graphSender ?? '',
    hasSmtpUrl: Boolean(stored.smtpUrl || config.smtpUrl),
    hasGraphClientSecret: Boolean(stored.graphClientSecret || config.graphClientSecret),
    fromEnvironment: config.fromEnvironment,
  }
}
