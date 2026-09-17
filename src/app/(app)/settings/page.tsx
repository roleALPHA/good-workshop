import Link from 'next/link'
import { Bot, Fingerprint } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { LanguageSwitcher } from '@/components/settings/language-switcher'
import { ProfileForm } from '@/components/settings/profile-form'
import { DeleteAccount } from '@/components/settings/delete-account'
import { listDirectory, ownEstate } from '@/domain/tenant/members'
import { fullName } from '@/domain/tenant/person-name'
import { readSessionCached } from '@/server/auth/session'

export const dynamic = 'force-dynamic'

/**
 * Your own account, in one place.
 *
 * /settings was a 404 until the language switcher needed somewhere to live, and
 * the header was the wrong answer: it already carries eight controls, and a
 * ninth would push the tenant's brand mark off a phone. Security and AI
 * Connection are listed here too, so that one page answers "what can I change
 * about my account" -- the profile menu in the header links to all of them.
 */
export default async function SettingsPage() {
  const [t, session] = await Promise.all([getTranslations('settings'), readSessionCached()])
  const actor = session
    ? {
        tenantId: session.tenantId,
        memberId: session.memberId,
        tenantRole: session.tenantRole,
        source: 'web' as const,
      }
    : null
  const [owns, directory] = actor
    ? await Promise.all([ownEstate(actor), listDirectory(actor)])
    : [{ workshops: 0, folders: 0 }, []]
  const colleagues = directory
    .filter((person) => !person.isSelf && person.status === 'active')
    .map((person) => ({ id: person.id, name: fullName(person) || person.email }))

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mb-6 text-[15px] text-[var(--fg-muted)]">{t('intro')}</p>

      <section className="mb-8">
        <h2 className="mb-1 text-[17px] font-medium">{t('profile.title')}</h2>
        <p className="mb-3 text-[15px] text-[var(--fg-muted)]">{t('profile.intro')}</p>
        <ProfileForm firstName={session?.firstName ?? ''} lastName={session?.lastName ?? ''} />
      </section>

      <section className="mb-8">
        <h2 className="mb-1 text-[17px] font-medium">{t('language.title')}</h2>
        <p className="mb-3 text-[15px] text-[var(--fg-muted)]">{t('language.intro')}</p>
        <LanguageSwitcher />
      </section>

      <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
        <li>
          <Link
            href="/settings/security"
            className="flex min-h-11 items-center gap-3 py-3 hover:bg-[var(--surface-raised)]"
          >
            <Fingerprint aria-hidden className="size-4 shrink-0 text-[var(--fg-muted)]" />
            <span className="min-w-0">
              <span className="block text-[15px] font-medium">{t('passkeys.title')}</span>
              <span className="block text-[14px] text-[var(--fg-muted)]">
                {t('passkeys.summary')}
              </span>
            </span>
          </Link>
        </li>
        <li>
          <Link
            href="/settings/ai-connection"
            className="flex min-h-11 items-center gap-3 py-3 hover:bg-[var(--surface-raised)]"
          >
            <Bot aria-hidden className="size-4 shrink-0 text-[var(--fg-muted)]" />
            <span className="min-w-0">
              <span className="block text-[15px] font-medium">{t('tokens.title')}</span>
              <span className="block text-[14px] text-[var(--fg-muted)]">
                {t('tokens.summary')}
              </span>
            </span>
          </Link>
        </li>
      </ul>

      <section className="mt-10">
        <h2 className="mb-1 text-[17px] font-medium">{t('deleteAccount.title')}</h2>
        <p className="mb-3 text-[15px] text-[var(--fg-muted)]">{t('deleteAccount.intro')}</p>
        {session && <DeleteAccount email={session.email} owns={owns} colleagues={colleagues} />}
      </section>
    </div>
  )
}
