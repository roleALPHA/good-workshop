import { defineConfig, devices } from '@playwright/test'
import { STORAGE_STATE } from './e2e/paths'

const PORT = Number(process.env.E2E_PORT ?? 3210)
const COLLAB_PORT = Number(process.env.GW_COLLAB_PORT ?? 3211)
const baseURL = `http://127.0.0.1:${PORT}`

/**
 * E2E is the narrow top of the pyramid: only flows that cannot be proven a
 * level down. Schedule arithmetic, ordering and duration parsing are unit
 * tested; what E2E adds is proof that the whole pipeline survives a real
 * browser -- server render, CSS tokens, responsive collapse, accessibility tree.
 *
 * See docs/konventionen-tests.md for the flow list.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL,
    // Only on a retry: traces and video on every run turn a fast suite into a
    // slow one and bury the interesting artefact among hundreds of boring ones.
    trace: 'on-first-retry',
    video: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // The public demo needs no database, so these two always run.
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /workshop\.spec\.ts/ },
    // The reading view is the most-used screen of this product per workshop --
    // a facilitator reads the agenda on a phone, in the room. It gets its own
    // project rather than a viewport tweak inside one test.
    { name: 'mobile', use: { ...devices['Pixel 5'] }, testIgnore: /workshop\.spec\.ts/ },

    // Everything past the login needs a database, so the authenticated tests
    // are skipped where there is none rather than failing confusingly.
    ...(process.env.DATABASE_URL
      ? [
          { name: 'setup', testMatch: /auth\.setup\.ts/ },
          {
            name: 'authenticated',
            testMatch: /workshop\.spec\.ts/,
            use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
            dependencies: ['setup'],
          },
        ]
      : []),
  ],

  webServer: [
    {
      // Builds first, then runs the standalone server -- byte for byte the
      // artifact the Docker image ships. Testing against `next dev` would prove
      // the wrong thing, and `next start` does not work with output: standalone
      // at all (see scripts/start-standalone.mjs).
      // In CI the build is its own step, so a failing build reads as a failing
      // build rather than as a mysterious webServer timeout.
      command: process.env.E2E_SKIP_BUILD
        ? `PORT=${PORT} pnpm start`
        : `pnpm build && PORT=${PORT} pnpm start`,
      // No proxy in the harness, so the browser is told where the
      // collaboration server actually is.
      env: {
        // Where the app thinks it lives. Magic-link verification redirects
        // against this, so getting it from the ambient environment means a
        // developer's .env.local can send the browser to a port that is not
        // listening -- which reads as "the login is broken".
        GW_APP_URL: baseURL,
        GW_COLLAB_URL: `ws://127.0.0.1:${COLLAB_PORT}/collab`,
        // The address the app itself uses when an MCP write joins a room.
        // Separate from the one above because the browser goes through a
        // proxy in a real deployment and this process is inside it.
        GW_COLLAB_INTERNAL_URL: `ws://127.0.0.1:${COLLAB_PORT}/collab`,
      },
      url: `${baseURL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: 'ignore',
      stderr: 'pipe',
    },
    // The collaboration server. Without it a signed-in editor has nowhere to
    // write, so the authenticated tests would be asserting against a page that
    // silently keeps everything in the browser.
    ...(process.env.DATABASE_URL
      ? [
          {
            command: 'node dist/collab-server.mjs',
            url: `http://127.0.0.1:${COLLAB_PORT}/health`,
            reuseExistingServer: !process.env.CI,
            timeout: 60_000,
            stdout: 'ignore' as const,
            stderr: 'pipe' as const,
            env: {
              GW_COLLAB_PORT: String(COLLAB_PORT),
              // Short enough that a test can wait for a write instead of
              // guessing at one.
              GW_COLLAB_PERSIST_MS: '50',
              GW_COLLAB_MATERIALIZE_MS: '150',
              GW_COLLAB_GRACE_MS: '200',
            },
          },
        ]
      : []),
  ],
})
