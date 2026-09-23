/**
 * The operator scope vocabulary, defined one level out.
 *
 * It moved to src/server/operator/scopes.ts for the reason the console's
 * `operatorConsoleEnabled` moved: the OAuth discovery documents are ordinary
 * routes present in every build, community included, and they have to name
 * these scopes. A route that imports from src/cloud pulls src/cloud into
 * `.next/standalone`, where the community image asserts it is absent.
 *
 * What moved is the LIST. Everything that acts on it -- the tools, the token
 * resolution, the database functions that will not execute for gw_app -- is
 * still here and still cloud-only. A community build carries six unused
 * strings; it does not carry an operator console.
 */
export * from '@/server/operator/scopes'
