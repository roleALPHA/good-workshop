import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      /**
       * What the next-intl plugin does in a Next build, done by hand here.
       *
       * Without it `getTranslations` has no configuration and throws, so
       * anything that renders a message would have to be tested against a mock
       * -- which would assert that the mock was called, not that the catalog
       * says what the test claims. With the alias, a test renders the real
       * German or English sentence out of the real messages/*.json.
       *
       * Only reachable for calls that pass an explicit locale: the other branch
       * of src/i18n/request.ts reads cookies() and headers(), which do not
       * exist outside a request. That is the same boundary production has.
       */
      'next-intl/config': fileURLToPath(new URL('./src/i18n/request.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // The shell scripts an operator runs are covered here too: a backup that
    // fails quietly is a bug like any other, and asserting it takes a shell and
    // a fake `docker`, not a browser.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.test.mjs'],
    // Database tests live in their own suite and their own CI job -- they need
    // a real Postgres with migrations applied. See vitest.db.config.ts.
    exclude: ['**/node_modules/**', 'src/**/*.db.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Deliberately not a global target: coverage thresholds only guard the
      // zones where a bug is silent. A repo-wide number just breeds alibi tests.
      include: ['src/domain/**', 'src/features/**', 'src/i18n/**'],
      // Modules whose tests live in another suite. Counting them here would
      // report them as untested and make the threshold measure the wrong thing
      // -- and lowering the threshold to accommodate that would quietly weaken
      // it for the pure logic it exists to protect.
      exclude: [
        // Covered by the `db` suite (*.db.test.ts) against a real Postgres,
        // which is a required check in its own right. Their invariants -- RLS,
        // composite FKs, compare-and-swap -- cannot be asserted without one.
        'src/domain/agenda/access.ts',
        'src/domain/agenda/repo.ts',
        'src/domain/workshop/repo.ts',
        'src/domain/workshop/collaborators.ts',
        // Folder-level collaboration: the same shape one level up. Its pure
        // half -- who holds what, who may hand on what -- is in
        // folder-access.ts precisely so that it stays counted here, which is
        // where a wrong answer silently grants or denies access.
        'src/domain/workshop/folder-collaborators.ts',
        // The OAuth flow's rows. What makes it safe is not in this file: the
        // single-use code is a `where used_at is null` inside an UPDATE and the
        // rotation is one too, so what is worth asserting is what Postgres does
        // under a race -- which needs Postgres. The decisions live in
        // oauth/rules.ts and are counted here.
        'src/domain/oauth/repo.ts',
        // The same, for guests. Its pure half -- when a link expires, what counts
        // as an address -- was split into share-rules.ts precisely so that it
        // stays counted here: a wrong answer from validUntil silently grants or
        // denies access, which is exactly what this threshold is for.
        'src/domain/workshop/share-links.ts',
        // Membership crosses the auth-role boundary -- member rows behind RLS,
        // e-mail addresses behind a role the application cannot join to. That
        // separation is the thing worth asserting, and it does not exist
        // without a database.
        'src/domain/tenant/members.ts',
        'src/domain/tenant/tokens.ts',
        // Type declarations: nothing to execute.
        '**/types.ts',
        // Browser glue, covered by Playwright: a dnd-kit coordinate getter and
        // a hook that calls server actions have no meaningful unit surface.
        'src/features/agenda/keyboard.ts',
        'src/features/agenda/use-persistence.ts',
        // The same category, and it only appears on this list because Vitest 4
        // started counting files no test imports -- under 3 it was never
        // measured at all, so this restores the intended scope rather than
        // narrowing it. What the hook does is asserted through
        // agenda-surface.test.tsx and by Playwright, which is where a React
        // hook's behaviour is legible.
        'src/features/agenda/use-local-document.ts',
        // A hand-written WebSocket client with reconnect backoff, and the hook
        // that drives it. What matters about them -- that an edit reaches the
        // other browser -- is asserted end to end by Playwright and by the
        // collaboration suite against a real server; a mocked socket here
        // would only assert that the mock was called.
        'src/features/collab/provider.ts',
        'src/features/collab/use-collab-document.ts',
        // Request-scoped wiring: reads cookies(), headers() and the session.
        // The branching worth guarding lives in resolve.ts, which is pure.
        'src/i18n/request.ts',
        'src/i18n/catalogs.ts',
      ],
      thresholds: {
        'src/domain/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'src/features/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        // Language resolution is exactly the silent branching these thresholds
        // exist for: every wrong answer renders a readable page in the wrong
        // language, which no other check notices.
        'src/i18n/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
      },
    },
  },
})
