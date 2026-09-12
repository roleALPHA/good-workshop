import { LICENSE, ROLEALPHA_URL, SOURCE_URL } from '@/lib/attribution'

/**
 * Present on every top-level view: app shell, login, mobile reading view and
 * the print stylesheet's page footer.
 *
 * The attribution is deliberately not an i18n key and is never interpolated
 * from tenant data, so no locale file or branding setting can quietly replace
 * it. Tenant branding customises --brand-* and the logo; it does not touch this.
 *
 * The two links leave the application, so they open in a tab of their own: a
 * facilitator who taps the licence in the middle of a workshop should come back
 * to the agenda, not have to find their way back to it.
 */
export function AppFooter({ className }: { className?: string }) {
  return (
    <footer
      className={className}
      style={{
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      }}
    >
      <p className="px-4 py-3 text-center text-[13px] text-[var(--fg-subtle)]">
        GoodWorkshop · powered by{' '}
        <a
          href={ROLEALPHA_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-[var(--fg-muted)]"
        >
          roleALPHA
        </a>{' '}
        ·{' '}
        <a
          href={SOURCE_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-[var(--fg-muted)]"
        >
          {LICENSE}
        </a>
      </p>
    </footer>
  )
}
