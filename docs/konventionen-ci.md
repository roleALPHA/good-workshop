# CI/CD und Docker-Build

Verbindlich bei Änderungen an Workflows unter `.github/`, am Dockerfile, an `compose.yaml` oder an der Release-Mechanik.

## Kostenlage

Bei Änderung verifizieren, Stand der Planung:

- **GitHub Actions** ist auf Standard-Runnern für **öffentliche** Repositories unbegrenzt kostenlos (Minuten werden nicht gezählt). Kostenpflichtig sind nur „larger runners".
- **ghcr.io** ist für **öffentliche** Packages ohne Storage- oder Egress-Kontingent.

Beides also frei, sobald das Repo unter AGPL-3.0 öffentlich steht. Solange es privat ist, gilt das Free-Kontingent (2.000 Actions-Minuten, 500 MB Packages) — dann Playwright-Matrix reduzieren.

## Workflows

### `.github/workflows/ci.yml` — auf `pull_request` und `push: main`

Jobs laufen **parallel**, nicht als Kette:

| Job     | Inhalt                                                                                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lint`  | ESLint (inkl. `no-restricted-imports` auf `src/server/db` und der Hex-Farb-Regel), Prettier-Check, `tsc --noEmit`                                                                     |
| `unit`  | Vitest, Coverage-Report als PR-Kommentar                                                                                                                                              |
| `db`    | Postgres-17-**Service-Container**, `migrate` + `provision`, dann RLS-Metadatentest, Cross-Tenant-Fixtures, Repository-Integrationstests                                               |
| `e2e`   | Playwright gegen den gebauten Standalone-Server, **zwei Shards**, Chromium plus Mobile-Viewport-Projekt (`Pixel 5`). Traces und Videos nur `on-first-retry`, als Artefakt hochgeladen |
| `build` | `docker buildx build --load` **ohne** Push — ein kaputtes Dockerfile fällt im PR auf, nicht erst beim Release                                                                         |

Der `db`-Job ist der wichtigste im ganzen Setup.

### `.github/workflows/release.yml` — auf Git-Tag `v*`

Push nach `ghcr.io/<owner>/goodworkshop`, Tags aus `docker/metadata-action` (`1.2.3`, `1.2`, `latest`; `latest` nur ohne Prerelease-Suffix), plus **SBOM und Provenance** (`sbom: true`, `provenance: mode=max`) — kostenlos und ein starkes Signal für On-Prem-Nutzer, die das Image durch einen Scanner schicken.

**Jede Architektur baut auf einem Runner ihrer eigenen Architektur** (`ubuntu-latest` für amd64, `ubuntu-24.04-arm` für arm64), pusht nur per Digest (`push-by-digest=true`), und ein `merge`-Job setzt daraus mit `docker buildx imagetools create` die Manifest-Liste zusammen. Beide Runner-Labels sind für öffentliche Repositories kostenlos.

Die naheliegende Alternative — ein Job mit QEMU-Emulation und `platforms: linux/amd64,linux/arm64` — ist deutlich einfacher, macht aus einem Zwei-Minuten-Next.js-Build aber einen Zwanzig-Minuten-Build. Bei Änderungen an diesem Workflow: **nicht auf QEMU zurückfallen**, nur weil die Digest-Merge-Mechanik umständlich aussieht.

## Konventionen

- `concurrency: { group: ${{ github.workflow }}-${{ github.ref }}, cancel-in-progress: true }` in jedem Workflow — sonst laufen überholte Commits weiter.
- Jede Action mit **Full-Length-Commit-SHA** gepinnt, nicht mit `@v4`. Dependabot hält sie aktuell.
- `permissions:` je Job minimal deklarieren. `packages: write` **ausschließlich** im Release-Job.
- Caching: `actions/setup-node` mit `cache: pnpm`; Playwright-Browser über `actions/cache` am Lockfile-Hash; Docker-Layer über `cache-from/to: type=gha`.

## Der Registry-Name muss kleingeschrieben sein

`github.repository` behält die Schreibweise der Organisation (`roleALPHA/good-workshop`). Eine Registry-Referenz mit Großbuchstaben wird abgewiesen: _„repository name must be lowercase"_. `docker/metadata-action` normalisiert seine **eigenen** Ausgaben, deshalb fällt das nur dort auf, wo der Name direkt verwendet wird — `push-by-digest` und `imagetools create`.

Jeder Job, der den Namen direkt benutzt, normalisiert ihn zuerst:

```yaml
- run: echo "IMAGE_NAME=${GITHUB_REPOSITORY,,}" >> "$GITHUB_ENV"
```

## Dockerfile-Regeln

- Multi-stage, `output: 'standalone'`, `USER node`.
- **Kein Secret in einem `ARG` oder Layer.**
- `HEALTHCHECK` auf `/api/health`. Der Healthcheck prüft DB-Konnektivität **und** dass die angewandte Migration zur Image-Version passt — ein Rolling Deploy mit ausstehender Migration fällt am Healthcheck durch, statt kaputte Seiten auszuliefern. Neue Checks kommen in `runChecks()` in `src/app/api/health/route.ts` dazu, nirgendwo sonst, und sind **fail-closed**: ein unbekannter Zustand ist kein gesunder Zustand.
- `GW_VERSION` kommt als Build-`ARG` ins Image und wird von `/api/health` zurückgemeldet. Das ist kein Secret — Secrets kommen ausschließlich zur Laufzeit als Environment-Variable.
- `.dockerignore` deckt `.git`, `node_modules`, `.next`, `test-results`.

## Branch Protection auf `main`

`lint`, `unit`, `db`, `e2e`, `build` sind Required Checks. **Keine Ausnahmen**, auch nicht für „nur ein Typo".
