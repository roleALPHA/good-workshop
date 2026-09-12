/**
 * Next's boot hook, and the one place that is guaranteed to run once per
 * server process before it serves anything.
 *
 * `auditAuthConfig()` existed, was correct, and was called by nothing -- the
 * only reference to it in the whole tree was its own definition. An install
 * serving magic links in the clear over http:// and printing them to stdout
 * came up silently, and the warnings written for exactly that case were never
 * printed. Warnings nobody prints have never prevented anything.
 *
 * console.warn rather than throw: an operator who has decided to run without
 * TLS on a closed network is not to be locked out of their own installation.
 * They are to be told, every time the process starts, in the log they already
 * read when something is wrong.
 */
export async function register(): Promise<void> {
  // Imported lazily: this module is evaluated in the edge runtime too, where
  // the auth config's dependencies are not available.
  const { auditAuthConfig } = await import('@/server/auth/config')

  for (const warning of auditAuthConfig()) {
    console.warn(`! ${warning}`)
  }

  // The import must sit DIRECTLY under the NEXT_RUNTIME check, not inside a
  // helper that is called from here: webpack substitutes the variable at build
  // time and then drops the branch, but only when it can see the import in it.
  // With the call one level down it followed the module graph into the database
  // driver and failed the edge bundle on `fs`.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { announceSetup } = await import('./instrumentation-node')
    await announceSetup()
  }
}
