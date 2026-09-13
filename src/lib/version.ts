import pkg from '../../package.json'

/**
 * Which build is running, as the deployment names it. See displayVersion below
 * for the version a person reads.
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

/**
 * The version a PERSON reads: the release number, and the build beside it when
 * the image is not that release.
 *
 * Not `appVersion()`, because inside a compose stack GW_VERSION is not what the
 * image was built as. compose.yaml hands the .env value in, and that value is
 * the image TAG -- so a preview pulling `main` printed "main" at the bottom of
 * every page. That is still the right answer for /api/health, which exists to
 * say which tag an operator deployed; it is the wrong one for a footer somebody
 * reads out in a support conversation.
 *
 * So the release number comes from package.json, which the build carries, and
 * the build comes from GW_BUILD: the same value the Dockerfile bakes into
 * GW_VERSION, under a name compose does not overwrite.
 *
 *  - `v0.4.1`               a release image (built from tag v0.4.1)
 *  - `v0.4.1+main-414f9e2`  a build off main after that release
 *  - `v0.4.1+dev`           a checkout, or an image built without the argument
 *
 * `+` because that is where semver puts build metadata: the part before it is a
 * version somebody can look up, the part after it says which build of it.
 */
export function displayVersion(): string {
  const release = `v${pkg.version}`
  const build = process.env.GW_BUILD ?? 'dev'
  // The publish workflow names a tag build `<tag>-<sha>`.
  if (build === release || build.startsWith(`${release}-`)) return release
  return `${release}+${build}`
}
