/**
 * Present on every top-level view: app shell, login, mobile reading view and
 * the print stylesheet's page footer.
 *
 * The attribution is deliberately not an i18n key and is never interpolated
 * from tenant data, so no locale file or branding setting can quietly replace
 * it. Tenant branding customises --brand-* and the logo; it does not touch this.
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
        GoodWorkshop · powered by roleALPHA
      </p>
    </footer>
  )
}
