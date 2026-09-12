# CI/CD and the Docker build

Binding for changes to workflows under `.github/`, to the Dockerfile, to `compose.yaml` or to
the release mechanics.

## What it costs

Verify when changing; state of the planning:

- **GitHub Actions** is unlimited and free on standard runners for **public** repositories
  (minutes are not counted). Only "larger runners" cost money.
- **ghcr.io** has no storage or egress quota for **public** packages.

So both are free once the repository is public under AGPL-3.0. While it is private the free
quota applies (2,000 Actions minutes, 500 MB packages) — reduce the Playwright matrix then.

## Workflows

### `.github/workflows/ci.yml` — on `pull_request` and `push: main`

Jobs run **in parallel**, not as a chain:

| Job     | Contents                                                                                                                                                                            |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint`  | ESLint (including `no-restricted-imports` on `src/server/db`, the hex-colour rule and the German-prose rule), Prettier check, `tsc --noEmit`                                        |
| `unit`  | Vitest, coverage report as a PR comment                                                                                                                                             |
| `db`    | Postgres 17 **service container**, `migrate` + `provision`, then the RLS metadata test, cross-tenant fixtures, repository integration tests                                         |
| `e2e`   | Playwright against the built standalone server, **two shards**, Chromium plus a mobile viewport project (`Pixel 5`). Traces and videos only `on-first-retry`, uploaded as artifacts |
| `build` | `docker buildx build --load` **without** a push — a broken Dockerfile shows up in the PR, not first at release time                                                                 |

The `db` job is the most important one in the whole setup.

### `.github/workflows/release.yml` — on git tag `v*`

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

## Conventions

- `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }`
  in every workflow — otherwise superseded commits keep running.
- Every action pinned to a **full-length commit SHA**, not to `@v4`. Dependabot keeps them
  current.
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
- `GW_VERSION` enters the image as a build `ARG` and is reported back by `/api/health`. That is
  not a secret — secrets arrive exclusively at runtime as environment variables.
- The message catalogs are imported statically, so the build traces them into
  `.next/standalone` on its own. A dynamic `import()` of `../messages/${locale}.json` works in
  `next dev` and comes out empty in the standalone output — which is invisible until every
  string renders as its own key in production.
- `.dockerignore` covers `.git`, `node_modules`, `.next`, `test-results`.

## Branch protection on `main`

`lint`, `unit`, `db`, `e2e` and `build` are required checks. **No exceptions**, not even for
"just a typo".
