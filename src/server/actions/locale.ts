'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { withAuth } from '@/server/db'
import { identity } from '@/server/db/schema'
import { readSession } from '@/server/auth/session'
import { LOCALE_COOKIE } from '@/i18n/config'
import { asLocale } from '@/i18n/resolve'

/**
 * Changing the language.
 *
 * Deliberately NOT written through `action()` from ./context.ts. That helper
 * bails with `unauthenticated` before it does anything, and the whole point of
 * this one is that it has to work signed out: the login page is the first
 * screen a visitor with a French browser reaches, and a switcher that only
 * works once you are already in is no switcher at all.
 */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = asLocale(formData.get('locale'))
  // A value that is not one of the four languages is a broken form or somebody
  // poking at it, not a situation a person needs an error page for.
  if (!locale) return

  /**
   * The cookie is written whether or not there is a session.
   *
   * For a signed-out visitor it is the only place the choice can live. For a
   * signed-in one it is what carries the choice through the sign-out: without
   * it, logging out would snap the login page back to German and look like the
   * setting had been thrown away.
   *
   * httpOnly because nothing in the browser reads it -- the resolution happens
   * in src/i18n/request.ts, on the server.
   */
  ;(await cookies()).set(LOCALE_COOKIE, locale, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  const session = await readSession()
  if (session) {
    // identity lives behind the gw_auth role -- withTenant() cannot see the
    // table at all. See the "two reads, one per role" note in session.ts.
    await withAuth((tx) =>
      tx.update(identity).set({ locale }).where(eq(identity.id, session.identityId)),
    )
  }

  // Everything is force-dynamic, but the rendered output above this action in
  // the tree is not re-requested on its own -- the layout has to be told.
  revalidatePath('/', 'layout')
}
