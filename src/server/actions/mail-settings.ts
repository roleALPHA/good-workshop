'use server'

import { revalidatePath } from 'next/cache'
import { assertTenantAdmin } from '@/domain/tenant/members'
import { withTenant } from '@/server/db'
import { ATTRIBUTION_TEXT } from '@/lib/attribution'
import {
  applyMailSettings,
  describeMailSettings,
  mailSettingsInput,
  readStoredMail,
  writeStoredMail,
} from '@/server/settings/mail-settings'
import { mailConfigFor } from '@/server/auth/mail'
import { DomainError } from '@/domain/errors'
import { currentActor, fail, failRelayed, toResult, type ActionResult } from './context'
import { getLocale } from 'next-intl/server'
import { translator } from '@/i18n/translator'

/**
 * Mail configuration in the browser, for installations whose operator has no
 * shell on the server -- which is most of them.
 *
 * Two rules the form depends on:
 *
 * A credential is never sent back. The view says whether one is stored, not
 * what it is; a page that renders the SMTP password into the DOM puts it in
 * every screenshot and every browser cache.
 *
 * A blank credential field means "leave it alone". The form cannot show the
 * current value, so blank is what an operator submits when they changed the
 * sender address and nothing else -- treating that as "delete" would break
 * mail for an edit that never mentioned it.
 */

export type MailSettingsView = ReturnType<typeof describeMailSettings>

export async function loadMailSettings(): Promise<ActionResult<MailSettingsView>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  try {
    assertTenantAdmin(actor)
    const stored = await withTenant(actor, (tx) => readStoredMail(tx, actor.tenantId))
    return { ok: true, data: describeMailSettings(stored, await mailConfigFor(actor.tenantId)) }
  } catch (error) {
    return toResult(error)
  }
}

export async function saveMailSettings(
  formData: FormData,
): Promise<ActionResult<MailSettingsView>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  const parsed = mailSettingsInput.safeParse({
    transport: formData.get('transport'),
    smtpUrl: str(formData.get('smtpUrl')),
    smtpFrom: str(formData.get('smtpFrom')),
    graphTenantId: str(formData.get('graphTenantId')),
    graphClientId: str(formData.get('graphClientId')),
    graphClientSecret: str(formData.get('graphClientSecret')),
    graphSender: str(formData.get('graphSender')),
  })
  if (!parsed.success) return fail('invalid_input', 'mail.checkSettings')

  try {
    assertTenantAdmin(actor)

    await withTenant(actor, async (tx) => {
      const stored = await readStoredMail(tx, actor.tenantId)
      await writeStoredMail(tx, actor.tenantId, applyMailSettings(stored, parsed.data))
    })

    revalidatePath('/admin/mail')
    const stored = await withTenant(actor, (tx) => readStoredMail(tx, actor.tenantId))
    return { ok: true, data: describeMailSettings(stored, await mailConfigFor(actor.tenantId)) }
  } catch (error) {
    return toResult(error)
  }
}

/**
 * Sends one message to the address of the person clicking, and reports what
 * came back.
 *
 * The only way to find out whether a relay works is to use it. Without this the
 * first real test is somebody's login link -- and a failure there looks like a
 * broken account rather than a broken configuration.
 */
export async function sendTestMail(formData: FormData): Promise<ActionResult<string>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'unauthenticated')

  const to = str(formData.get('to')) ?? ''
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return fail('invalid_input', 'mail.invalidAddress')
  }

  try {
    assertTenantAdmin(actor)

    const { sendMail } = await import('@/server/auth/mail')
    // The admin who pressed the button is the recipient, so their language is
    // the right one -- unlike an invitation, where the reader is somebody else.
    const t = translator(await getLocale(), 'mail.test')
    await sendMail(
      {
        to,
        subject: t('subject'),
        text: [t('body'), '', ATTRIBUTION_TEXT].join('\n'),
      },
      actor.tenantId,
    )

    return { ok: true, data: to }
  } catch (error) {
    // A permission failure is ours and gets translated; anything else came from
    // the relay and is shown verbatim, on purpose. This is an admin screen, and
    // "535 authentication failed" is the whole reason to press the button.
    if (error instanceof DomainError) return toResult(error)
    return failRelayed('failed', message(error))
  }
}

function str(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || undefined
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Unbekannter Fehler.'
}
