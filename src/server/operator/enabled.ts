/**
 * Whether THIS process is the operator console.
 *
 * Deliberately outside src/cloud, and that is the whole point of the file. The
 * two `.well-known` documents are ordinary routes that exist in every build --
 * a community one included -- and importing `@/cloud/operator/db` into them
 * would pull src/cloud into `.next/standalone`, where the community image
 * asserts `! test -e /app/src/cloud`.
 *
 * So the predicate lives here, once, and src/cloud/operator/db.ts re-exports
 * it. Two copies of an env check is how a console ends up serving a
 * customer's metadata, or the other way round.
 */
export function operatorConsoleEnabled(): boolean {
  return process.env.GW_OPERATOR_CONSOLE === '1' && Boolean(process.env.OPERATOR_DATABASE_URL)
}
