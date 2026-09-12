import Link from 'next/link'
import { Fingerprint, KeyRound } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { LanguageSwitcher } from '@/components/settings/language-switcher'

export const dynamic = 'force-dynamic'

/**
 * Your own account, in one place.
 *
 * /settings was a 404 until the language switcher needed somewhere to live, and
 * the header was the wrong answer: it already carries eight controls, and a
 * ninth would push the tenant's brand mark off a phone. Passkeys and Tokens are
 * listed here too -- they were reachable only from the header, which meant
 * there was no page that answered "what can I change about my account".
 */
export default async function SettingsPage() {
  const t = await getTranslations('settings')

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">{t('title')}</h1>
      <p className="mb-6 text-[15px] text-[var(--fg-muted)]">{t('intro')}</p>

      <section className="mb-8">
        <h2 className="mb-1 text-[17px] font-medium">{t('language.title')}</h2>
        <p className="mb-3 text-[15px] text-[var(--fg-muted)]">{t('language.intro')}</p>
        <LanguageSwitcher />
      </section>

      <ul className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
        <li>
          <Link
            href="/settings/passkeys"
            className="flex min-h-11 items-center gap-3 py-3 hover:bg-[var(--surface-raised)]"
          >
            <Fingerprint aria-hidden className="size-4 shrink-0 text-[var(--fg-muted)]" />
            <span className="min-w-0">
              <span className="block text-[15px] font-medium">{t('passkeys.title')}</span>
              <span className="block text-[14px] text-[var(--fg-muted)]">
                {t('passkeys.intro')}
              </span>
            </span>
          </Link>
        </li>
        <li>
          <Link
            href="/settings/tokens"
            className="flex min-h-11 items-center gap-3 py-3 hover:bg-[var(--surface-raised)]"
          >
            <KeyRound aria-hidden className="size-4 shrink-0 text-[var(--fg-muted)]" />
            <span className="min-w-0">
              <span className="block text-[15px] font-medium">{t('tokens.title')}</span>
              <span className="block text-[14px] text-[var(--fg-muted)]">{t('tokens.intro')}</span>
            </span>
          </Link>
        </li>
      </ul>
    </div>
  )
}
