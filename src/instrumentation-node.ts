/**
 * The half of the boot hook that needs Node.
 *
 * Its own module because instrumentation.ts is evaluated in the edge runtime as
 * well, and everything reachable from there is bundled for it -- including, via
 * the setup check, the Postgres driver and its `fs` import.
 */
/**
 * Prints the setup key while there is still nobody who could log in.
 *
 * This is the whole access control on the first-run screen: whoever can read
 * this log is the operator. Printed only when the installation actually has no
 * administrator yet, so a running system does not keep a working claim token in
 * its log -- and printed on every start until somebody uses it, because the
 * first attempt often comes after a restart or two.
 *
 * A database that is not up yet is not an error here: the process is starting,
 * and the migration container may still be running. The next start prints it.
 */
export async function announceSetup(): Promise<void> {
  try {
    const { needsSetup, currentSetupToken } = await import('@/server/settings/setup')
    if (!(await needsSetup())) return

    const { authConfig } = await import('@/server/auth/config')
    const url = new URL('/setup', authConfig.appUrl)

    console.log('')
    console.log('  Diese Installation hat noch keine Administratorin.')
    console.log('')
    console.log(`    ${url}`)
    console.log(`    Einrichtungsschlüssel: ${currentSetupToken()}`)
    console.log('')
    console.log('  Der Schlüssel gilt, bis dieser Prozess neu startet.')
    console.log('')
  } catch {
    // Database not reachable yet, or no schema. Nothing to announce, and
    // nothing that should keep the server from coming up.
  }
}
