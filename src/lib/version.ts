/**
 * Which build is running.
 *
 * `GW_VERSION` is baked into the runtime image as a build ARG (see the
 * Dockerfile), so the value is the tag an operator actually deployed:
 * `v0.3.1` for a release, `main-414f9e2` for a build off main, and `dev` for a
 * checkout that was never packaged at all. That is why the fallback is not an
 * error -- `pnpm dev` has no image and no tag, and saying so is the truth.
 *
 * Read per call rather than frozen at import. Inside a container the value
 * never changes, so there is nothing to cache; what the function buys is a
 * seam a test can stub, which a module constant evaluated at import would not.
 *
 * Server side only. Next inlines `process.env.*` into a client bundle for
 * NEXT_PUBLIC_ names and for nothing else, so a Client Component calling this
 * would quietly be told `dev` on a machine running v0.3.1 -- a wrong answer is
 * worse here than no answer, because the whole point of showing a version is
 * that somebody trusts it in a support conversation.
 */
export function appVersion(): string {
  return process.env.GW_VERSION ?? 'dev'
}
