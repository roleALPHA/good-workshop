/**
 * Shared with playwright.config.ts, which must not import the setup file
 * itself: loading a module that defines tests while the config is being read
 * makes Playwright refuse to start.
 */
export const STORAGE_STATE = 'e2e/.auth/session.json'
