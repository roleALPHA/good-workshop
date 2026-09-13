import { LICENSE, ROLEALPHA_URL, SOURCE_URL } from '@/lib/attribution'
import { appVersion } from '@/lib/version'

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
 *
 * The build follows as its own segment rather than being written into the
 * sentence, which keeps the claim above literally true -- the attribution line
 * is a constant, and a version read from the environment is not. It is here and
 * not only in /api/health because the person who needs it is usually the one
 * describing a problem, and "look at the bottom of the page" is an instruction
 * they can follow; an ops endpoint behind a token is not.
 *
 * A Server Component, and every layout that renders it is `force-dynamic`, so
 * this is the running container's environment and not whatever the image was
 * built with. See the note in @/lib/version.
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
        </a>{' '}
        {/* nowrap because a build off main reads `main-414f9e2`, and a browser
            is allowed to break a line after a hyphen -- half a commit hash at
            the end of a line is worse than a slightly longer line. */}
        · <span className="whitespace-nowrap">{appVersion()}</span>
      </p>
    </footer>
  )
}
