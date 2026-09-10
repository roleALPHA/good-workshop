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
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    // Database tests live in their own suite and their own CI job -- they need
    // a real Postgres with migrations applied. See vitest.db.config.ts.
    exclude: ['**/node_modules/**', 'src/**/*.db.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // Deliberately not a global target: coverage thresholds only guard the
      // zones where a bug is silent. A repo-wide number just breeds alibi tests.
      include: ['src/domain/**', 'src/features/**'],
      thresholds: {
        'src/domain/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
        'src/features/**': { statements: 80, branches: 80, functions: 80, lines: 80 },
      },
    },
  },
})
