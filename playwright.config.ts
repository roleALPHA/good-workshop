import { defineConfig, devices } from '@playwright/test'
import { STORAGE_STATE } from './e2e/paths'

const PORT = Number(process.env.E2E_PORT ?? 3210)
const COLLAB_PORT = Number(process.env.GW_COLLAB_PORT ?? 3211)
// localhost, not 127.0.0.1. Browsers treat localhost as the one insecure
// origin where WebAuthn still works, and they refuse an IP address as a
// Relying Party ID outright -- so the passkey tests cannot run against the
// loopback address, however equivalent the two look.
const baseURL = `http://localhost:${PORT}`

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
  // Capped rather than "one per core". Every authenticated test now seeds its
  // own workshop through the collaboration room, and a dozen rooms opening at
  // once is what turned a green suite into a differently-red one on every run.
  // Fewer workers is also FASTER here -- less contention, less retrying.
  workers: process.env.CI ? 2 : 4,
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
    // What is left of the database-free half: the door. Everything about the
    // agenda itself moved -- the derivations into component tests, the layout
    // and interaction assertions into the authenticated projects below --
    // when the public demo page that used to host them was removed.
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /(entry|setup)\.spec\.ts/,
    },
    { name: 'mobile', use: { ...devices['Pixel 5'] }, testMatch: /(entry|setup)\.spec\.ts/ },

    // Everything past the login needs a database, so the authenticated tests
    // are skipped where there is none rather than failing confusingly.
    ...(process.env.DATABASE_URL
      ? [
          { name: 'setup', testMatch: /auth\.setup\.ts/ },
          {
            name: 'authenticated',
            testMatch: /(workshop|agenda)\.spec\.ts/,
            use: { ...devices['Desktop Chrome'], storageState: STORAGE_STATE },
            dependencies: ['setup'],
          },
          // The reading view is the most-used screen of this product per
          // workshop -- a facilitator reads the agenda on a phone, in the room.
          // It gets its own project rather than a viewport tweak inside one
          // test, and it needs a signed-in session now that the agenda it reads
          // is a real one.
          //
          // agenda.spec.ts deliberately does NOT run here. Its dragging and
          // in-row editing skip themselves below 1024px because the editor does
          // not mount there, and what remains -- horizontal overflow, the
          // footer -- has its own assertions in reading-view.spec.ts. Running
          // it anyway meant seeding a workshop through a layout that has no
          // editor, which is what timed out.
          {
            name: 'authenticated-mobile',
            testMatch: /reading-view\.spec\.ts/,
            use: { ...devices['Pixel 5'], storageState: STORAGE_STATE },
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
        // localhost, like baseURL: the session cookie is set for the host the
        // page was loaded from, and a socket to 127.0.0.1 is a different host
        // as far as the browser is concerned -- it would carry no cookie, and
        // the document would sit at "offline" with nothing in the log.
        GW_COLLAB_URL: `ws://localhost:${COLLAB_PORT}/collab`,
        // The address the app itself uses when an MCP write joins a room.
        // Separate from the one above because the browser goes through a
        // proxy in a real deployment and this process is inside it.
        GW_COLLAB_INTERNAL_URL: `ws://localhost:${COLLAB_PORT}/collab`,
      },
      // The root, not /api/health. Health is honest about needing a database --
      // it returns 503 without one -- while "is the server listening" and "can
      // this container serve the app" are different questions, and the harness
      // is asking the first one. A redirect answers it just as well, which is
      // what `/` is now that the public demo page is gone.
      url: `${baseURL}/`,
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
              // The socket refuses an upgrade from a foreign Origin, and it
              // works out what "foreign" means from GW_APP_URL. In the image
              // this process shares an environment with the app; here it is a
              // separate one, so it has to be told -- otherwise it compares
              // the browser's Origin against the default localhost:3000 and
              // every authenticated test sees a document stuck at "offline".
              GW_APP_URL: baseURL,
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
