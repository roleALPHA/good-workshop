'use server'

import { revalidatePath } from 'next/cache'
import { assertTenantAdmin } from '@/domain/tenant/members'
import { withTenant } from '@/server/db'
import {
  applyMailSettings,
  describeMailSettings,
  mailSettingsInput,
  readStoredMail,
  writeStoredMail,
} from '@/server/settings/mail-settings'
import { mailConfigFor } from '@/server/auth/mail'
import { currentActor, type ActionError, type ActionResult } from './context'

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
  if (!actor) return fail('unauthenticated', 'Bitte melde dich an.')

  try {
    assertTenantAdmin(actor)
    const stored = await withTenant(actor, (tx) => readStoredMail(tx, actor.tenantId))
    return { ok: true, data: describeMailSettings(stored, await mailConfigFor(actor.tenantId)) }
  } catch (error) {
    return fail('forbidden', message(error))
  }
}

export async function saveMailSettings(
  formData: FormData,
): Promise<ActionResult<MailSettingsView>> {
  const actor = await currentActor()
  if (!actor) return fail('unauthenticated', 'Bitte melde dich an.')

  const parsed = mailSettingsInput.safeParse({
    transport: formData.get('transport'),
    smtpUrl: str(formData.get('smtpUrl')),
    smtpFrom: str(formData.get('smtpFrom')),
    graphTenantId: str(formData.get('graphTenantId')),
    graphClientId: str(formData.get('graphClientId')),
    graphClientSecret: str(formData.get('graphClientSecret')),
    graphSender: str(formData.get('graphSender')),
  })
  if (!parsed.success) return fail('invalid_input', 'Diese Eingaben passen nicht.')

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
    return fail('failed', message(error))
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
  if (!actor) return fail('unauthenticated', 'Bitte melde dich an.')

  const to = str(formData.get('to')) ?? ''
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    return fail('invalid_input', 'Bitte eine gültige Adresse angeben.')
  }

  try {
    assertTenantAdmin(actor)

    const { sendMail } = await import('@/server/auth/mail')
    await sendMail(
      {
        to,
        subject: 'GoodWorkshop: Testnachricht',
        text: [
          'Diese Nachricht bestätigt, dass der Mailversand funktioniert.',
          '',
          'Anmeldelinks und Einladungen gehen ab jetzt denselben Weg.',
          '',
          'GoodWorkshop · powered by roleALPHA',
        ].join('\n'),
      },
      actor.tenantId,
    )

    return { ok: true, data: to }
  } catch (error) {
    // Shown verbatim, on purpose: this is an admin screen, and the message from
    // the relay -- "535 authentication failed", "Access denied" -- is the whole
    // reason to press the button.
    return fail('failed', message(error))
  }
}

const fail = <T>(error: ActionError, text: string): ActionResult<T> => ({
  ok: false,
  error,
  message: text,
})

function str(value: FormDataEntryValue | null): string | undefined {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || undefined
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Unbekannter Fehler.'
}
