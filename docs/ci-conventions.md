# CI/CD and the Docker build

Binding for changes to workflows under `.github/`, to the Dockerfile, to `compose.yaml` or to
the release mechanics.

## What it costs

Verify when changing; state of the planning:

- **GitHub Actions** is unlimited and free on standard runners for **public** repositories
  (minutes are not counted). Only "larger runners" cost money.
- **ghcr.io** has no storage or egress quota for **public** packages.

So both are free once the repository is public. While it is private the free
quota applies (2,000 Actions minutes, 500 MB packages) — reduce the Playwright matrix then.

## Workflows

### `.github/workflows/ci.yml` — on `pull_request` and `push: main`

Jobs run **in parallel**, not as a chain:

| Job     | Contents                                                                                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint`  | ESLint (including `no-restricted-imports` on `src/server/db`, the hex-colour rule and the German-prose rule), Prettier check, `tsc --noEmit`, `check:docs`, `check:licenses`        |
| `dco`   | Pull requests only: every commit carries a `Signed-off-by` trailer matching its author. Bots and merge commits are exempt — see CONTRIBUTING.md for what it certifies               |
| `unit`  | Vitest, coverage report as a PR comment                                                                                                                                             |
| `db`    | Postgres 17 **service container**, `migrate` + `provision`, then the RLS metadata test, cross-tenant fixtures, repository integration tests                                         |
| `cloud` | A second Postgres, the build recorded as `cloud`, `drizzle-cloud/` applied, then `pnpm test:db:cloud`: two tenants side by side for sign-in, share links and OAuth                  |
| `e2e`   | Playwright against the built standalone server, **two shards**, Chromium plus a mobile viewport project (`Pixel 5`). Traces and videos only `on-first-retry`, uploaded as artifacts |
| `build` | `docker buildx build --load` **without** a push — a broken Dockerfile shows up in the PR, not first at release time. Then Grype over that image: high and critical with a fix fail  |

The `db` job is the most important one in the whole setup.

### `.github/workflows/codeql.yml` — on push, on pull request, and weekly

CodeQL with `security-extended`, over `javascript-typescript` and over the workflows themselves.
Free for public repositories, and the only scanner here that reads the **code** rather than the
lockfile: the ESLint guardrails catch the shapes this project decided against, and CodeQL catches
the ones nobody decided about — taint from a request parameter into a query, a redirect built
from user input, a comparison that returns early on a secret.

The weekly run is not redundant with the per-push one. A finding can arrive without the code
changing, because the query packs are updated; yesterday's clean run is not evidence about
today's rules.

No build step. This is TypeScript and CodeQL reads it without one — adding `next build` would
double the pipeline's slowest job to tell the scanner what it already knows.

### `.github/workflows/security.yml` — on pull request, on push to `main`, and weekly

Three jobs, each reading something no other workflow reads:

| Job            | Reads                    | Why it is not redundant                                                                                                                                                   |
| -------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `secrets`      | the whole git history    | A credential committed and deleted in the next commit is still in every clone. gitleaks as a checksum-verified binary: `gitleaks-action` wants a paid key for an org repo |
| `workflows`    | `.github/`               | zizmor: template injection, over-broad permissions, credentials persisted into artifacts, cache poisoning in release jobs, Dependabot without cooldown                    |
| `dependencies` | `pnpm-lock.yaml` via OSV | The dependency review only sees what a PR _adds_; this sees the whole closure, and the weekly run catches an advisory against a version that has been there for months    |

A false positive in gitleaks goes into `.gitleaksignore` by fingerprint, **with the reason on the
line above**. zizmor fails the job rather than uploading SARIF: an upload needs
`security-events: write`, which a pull request from a fork does not get.

### `.github/workflows/scorecard.yml` — on push to `main`, weekly, and on branch protection changes

The OpenSSF Scorecard, published so that somebody evaluating GoodWorkshop can read the result
without taking our word for it. The only workflow besides `publish.yml` with `id-token: write`,
which Scorecard needs to publish.

### `.github/workflows/dependency-review.yml` — on pull request

Answers the one question the other jobs cannot: does **this** pull request add a dependency with
a known vulnerability, or one whose licence this project cannot absorb — before the merge rather
than after Dependabot notices it on `main`. Fails at `moderate`, because this is a small tree and
a moderate finding here is a decision somebody should make.

### `.github/workflows/publish.yml` — on push to `main`, on git tag `v*`

Push to `ghcr.io/<owner>/goodworkshop`, tags from `docker/metadata-action` (`1.2.3`, `1.2`,
`latest`; `latest` only without a prerelease suffix), plus **SBOM and provenance**
(`sbom: true`, `provenance: mode=max`) — free, and a strong signal for on-prem users who put
the image through a scanner.

**Each architecture builds on a runner of its own architecture** (`ubuntu-latest` for amd64,
`ubuntu-24.04-arm` for arm64), pushes by digest only (`push-by-digest=true`), and a `merge` job
assembles the manifest list from those with `docker buildx imagetools create`. Both runner
labels are free for public repositories.

The obvious alternative — one job with QEMU emulation and
`platforms: linux/amd64,linux/arm64` — is considerably simpler, and turns a two-minute Next.js
build into a twenty-minute one. When changing this workflow: **do not fall back to QEMU** just
because the digest-merge mechanics look awkward.

The `merge` job signs the manifest list with a **keyless cosign signature** and attaches a
**GitHub build attestation** (`actions/attest-build-provenance`), both on the final digest. That
is the only reason it holds `id-token: write` and `attestations: write`; the per-architecture
build jobs hold neither. SECURITY.md has the commands an operator uses to verify both.

A third job, `sbom`, runs **only for tags** and attaches `sbom.cdx.json` and
`THIRD-PARTY-LICENSES.txt` to the GitHub release. It takes `contents: write` and nothing else;
in particular it does not take `id-token: write`, for the reason in the build job's comment.

The CycloneDX document it generates is not the same as the SPDX attestation on the image, and
neither replaces the other: BuildKit scans the container's filesystem, which sees the few dozen
packages Next traced in; this one reads the lockfile, which sees the whole closure including
everything bundled into the JavaScript. A reviewer asking "which versions are in this release"
wants the second.

The job creates the release from the tag's annotation if it does not exist yet — pushing a tag
and writing the release notes by hand are two steps, and this one may win the race. Write the
annotation as if it were the release note; `gh release edit` can still improve it afterwards.

## Conventions

- `concurrency` in every workflow — otherwise superseded commits keep running. `ci.yml` puts
  `github.event_name` in the group as well: a scheduled run and a push to `main` share a ref, and
  cancelling one because the other started would mean the nightly quietly never completes.
- **`ci.yml` also runs nightly on `main`, and that is not redundant.** Nothing in this pipeline
  is hermetic: the lockfile pins packages but not the registry, the Dockerfile pins a base image
  by tag, Playwright downloads a browser, and the runner image is rebuilt weekly. A pipeline that
  runs only on a push tells you the code was fine on the day it was written — the one day nobody
  needs to be told about. The nightly is how `main` breaking gets noticed on a Tuesday instead of
  in the first pull request after a fortnight of quiet.

  Two things to know about it: GitHub **disables a scheduled workflow after 60 days** with no
  activity in the repository, and it says so by e-mail — a silent nightly is a stopped nightly,
  not a passing one. And `workflow_dispatch` is on the same file, so a run can be asked for after
  something changed _outside_ the repository.

- Every action pinned to a **full-length commit SHA**, not to `@v4`. Dependabot keeps them
  current — `.github/dependabot.yml` covers actions, npm and Docker, weekly, with a **seven-day
  cooldown**: a malicious release is usually caught within days, and a version that has been
  out for a week has had them. Security updates are not delayed by it.
- **Every checkout sets `persist-credentials: false`.** Without it the job token stays in
  `.git/config` for every later step to read, and ends up in any artifact that includes the
  working tree. No job here talks to the repository after checking it out.
- **No dependency cache in a release job.** Any run on `main` writes the cache, and restoring
  it into the job that builds release documents lets a poisoned entry reach them.
- **A `pnpm.overrides` block is not a small change.** Adding one re-resolves parts of the graph,
  and the resolver is free to land somewhere else than the lockfile did. Pinning one transitive
  package away from an advisory pulled in `@esbuild-kit/core-utils` with an esbuild carrying an
  advisory of its own — a net loss, caught by the dependency review before it merged. Prefer the
  Dependabot security update, which resolves the same problem without re-deriving the tree, and
  reach for an override only when no upstream fix exists.

- **Repository security settings are part of the setup, not a preference.** Secret scanning with
  push protection, Dependabot alerts and security updates, and private vulnerability reporting
  are all on, and all free for a public repository. Push protection is the one with a daily
  consequence: a push that carries something shaped like a credential is refused rather than
  merged and revoked afterwards.
- Declare `permissions:` minimally per job. `packages: write` **only** in the release job.
- Caching: `actions/setup-node` with `cache: pnpm`; Playwright browsers through `actions/cache`
  keyed on the lockfile hash; Docker layers through `cache-from/to: type=gha`.
- **Ignore patterns carry no leading anchor.** Every one in `eslint.config.mjs` is prefixed with
  `**/`, and `.claude/worktrees/**` is ignored outright. Sessions here work in git worktrees
  placed _inside_ the repository, so an anchored `.next/**` walks around the artefact one
  directory down: once a worktree had been built, `pnpm lint` in the main checkout drowned in
  hundreds of findings from minified vendor chunks. CI never saw it, because CI has no
  worktrees — which is the point worth remembering.
  **A green pipeline is not evidence that a local command works.** A worktree is a checkout of
  its own at its own commit, with its own lint run; linting one from the main checkout reports
  findings about code that is not on this branch.

## The registry name has to be lowercase

`github.repository` keeps the organisation's spelling (`roleALPHA/good-workshop`). A registry
reference with capitals is refused: _"repository name must be lowercase"_.
`docker/metadata-action` normalises its **own** outputs, which is why this only shows up where
the name is used directly — `push-by-digest` and `imagetools create`.

Every job that uses the name directly normalises it first:

```yaml
- run: echo "IMAGE_NAME=${GITHUB_REPOSITORY,,}" >> "$GITHUB_ENV"
```

## Dockerfile rules

- Multi-stage, `output: 'standalone'`, `USER node`.
- **No secret in an `ARG` or a layer.**
- `HEALTHCHECK` on `/api/health`. The healthcheck verifies database connectivity **and** that
  the applied migration matches the image version — a rolling deploy with a pending migration
  fails the healthcheck rather than serving broken pages. New checks go into `runChecks()` in
  `src/app/api/health/route.ts`, nowhere else, and are **fail-closed**: an unknown state is not
  a healthy state.
- `pnpm licenses:notices` runs in the **builder** stage and its output is copied into the
  runner, together with `LICENSE`. MIT, BSD and Apache all require the notice to travel with the
  distributed software, and a list in the source repository does not discharge that for somebody
  who only ever receives the image.
- `GW_VERSION` enters the image as a build `ARG` and is reported back by `/api/health` and in
  the page footer. Read through `appVersion()` in `src/lib/version.ts`, never `process.env`
  directly, and only from a Server Component or a route handler — Next inlines `process.env.*`
  into a client bundle for `NEXT_PUBLIC_` names and nothing else, so a Client Component would be
  told `dev` on a machine running a release. That is
  not a secret — secrets arrive exclusively at runtime as environment variables.
- The message catalogs are imported statically, so the build traces them into
  `.next/standalone` on its own. A dynamic `import()` of `../messages/${locale}.json` works in
  `next dev` and comes out empty in the standalone output — which is invisible until every
  string renders as its own key in production.
- `.dockerignore` covers `.git`, `node_modules`, `.next`, `test-results`.

## Branch protection on `main`

Every CI job is a required check, and so are CodeQL and the dependency review. **No
exceptions**, not even for "just a typo".

This is a **ruleset**, not the old branch-protection API, and it is worth saying out loud that
for a long time this paragraph described something that did not exist: `main` had no protection
at all. A convention that lives only in a document is a convention that holds until the first
hurried evening. The ruleset also blocks deletion and force pushes, requires a pull request, and
allows only squash merges — which is what the history here already looked like.

Approvals are deliberately **not** required. A single maintainer cannot approve their own pull
request, so requiring one would mean either a second account or a rule everybody learns to
bypass. The checks are the gate; the review is a habit.
