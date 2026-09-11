import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
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
      include: ['src/domain/**', 'src/features/**'],
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
        // A hand-written WebSocket client with reconnect backoff, and the hook
        // that drives it. What matters about them -- that an edit reaches the
        // other browser -- is asserted end to end by Playwright and by the
        // collaboration suite against a real server; a mocked socket here
        // would only assert that the mock was called.
        'src/features/collab/provider.ts',
        'src/features/collab/use-collab-document.ts',
      ],
      thresholds: {
        'src/domain/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'src/features/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
      },
    },
  },
})
