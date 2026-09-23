/**
 * Where the private build's code is plugged in, for the places that build:
 * next.config.ts and scripts/build-collab.mjs.
 *
 * They live in their own file so every builder agrees, and so the empty-string
 * case is settled once: a Docker ARG that is declared but never passed arrives
 * as an empty string, and an empty alias would point the bundler at nothing.
 */
export function billingAdaptersPath(env, fallback) {
  // The name spelled out as a string, so check-docs.mjs can see that this
  // variable is still read -- it greps for the name, and a property access
  // through a parameter looks like nothing to it.
  return env['GW_BILLING_ADAPTERS']?.trim() || fallback
}

/**
 * Where `@gw/catalog` points: the Discover catalogue -- the curated methods and
 * designs, their translations and the vocabulary they are filtered by.
 *
 * Same mechanism as the adapters above and, unlike them, a fallback that works:
 * an installation without the private repository has an empty catalogue rather
 * than one that refuses. See src/cloud/catalog/unavailable.ts for why the two
 * differ.
 */
export function catalogPath(env, fallback) {
  // Spelled out for the same reason as above: check-docs.mjs greps for the
  // name, and a property access through a parameter looks like nothing to it.
  return env['GW_CATALOG']?.trim() || fallback
}
