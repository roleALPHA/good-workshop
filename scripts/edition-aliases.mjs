/**
 * Where `@gw/billing-adapters` points, for the two places that build code:
 * next.config.ts and scripts/build-collab.mjs.
 *
 * It lives in its own file so both agree, and so the empty-string case is
 * settled once: a Docker ARG that is declared but never passed arrives as an
 * empty string, and an empty alias would point the bundler at nothing.
 */
export function billingAdaptersPath(env, fallback) {
  // The name spelled out as a string, so check-docs.mjs can see that this
  // variable is still read -- it greps for the name, and a property access
  // through a parameter looks like nothing to it.
  return env['GW_BILLING_ADAPTERS']?.trim() || fallback
}
