# GoodWorkshop

Open-Source-Workshopplanung. Selbst gehostet, MCP-fähig.

Eine freie Alternative zu SessionLab: Agenden aus Modulen, Clustern und Workshoptagen
bauen, per Drag & Drop umsortieren, als Markdown exportieren — und die Daten bleiben
auf der eigenen Maschine.

> **Status: in Entwicklung.** Meilenstein 1 (Editor-Kern) ist im Bau. Noch kein Release.

## Zwei Dinge, die bei einer On-Prem-Installation zuerst schiefgehen

**1. Passkeys brauchen HTTPS.** Außer auf `localhost` funktionieren WebAuthn-Passkeys
nicht über `http://`. Wer auf `http://192.168.1.50:3000` hostet, kann Passkeys gar nicht
nutzen. Deshalb sind E-Mail-Magic-Links ein vollwertiger eigenständiger Auth-Pfad, kein
Fallback — und das `tls`-Compose-Profil (Caddy, automatisches HTTPS) ist der empfohlene
Weg, nicht der Anhang.

**2. `GW_RP_ID` ist an den Hostnamen gebunden.** Eine Hostname-Änderung nach der
Passkey-Registrierung invalidiert _jeden_ registrierten Passkey. Vorher den Hostnamen
festlegen.

Falls weder HTTPS noch SMTP verfügbar sind: `GW_MAIL_TRANSPORT=console` druckt Magic
Links auf stdout, und `GW_BOOTSTRAP_ADMIN_EMAIL` legt beim ersten Start einen Admin an
und gibt dessen Login-Link ebenfalls auf stdout aus.

## Entwicklung

```bash
pnpm install
pnpm dev
```

| Befehl               | Zweck                                                               |
| -------------------- | ------------------------------------------------------------------- |
| `pnpm lint`          | ESLint inkl. der Projekt-Guardrails                                 |
| `pnpm typecheck`     | `tsc --noEmit`                                                      |
| `pnpm test`          | Vitest (Unit + Komponente)                                          |
| `pnpm test:coverage` | mit Coverage-Schwellen auf `src/domain` und `src/features`          |
| `pnpm test:e2e`      | Playwright (Desktop + Pixel 5) gegen den gebauten Standalone-Server |
| `pnpm test:e2e:ui`   | dieselbe Suite im Playwright-UI-Modus                               |
| `pnpm format`        | Prettier                                                            |
| `pnpm build`         | Produktions-Build (`output: 'standalone'`)                          |

### Arbeitsweisen

Drei verbindliche Konventionen liegen als Skills im Repo und gelten für jeden Beitrag:

- [`goodworkshop-ui`](.claude/skills/goodworkshop-ui/SKILL.md) — Mobile-first, Farbtokens, Branding, Accessibility
- [`goodworkshop-testing`](.claude/skills/goodworkshop-testing/SKILL.md) — Testpyramide, RLS-Tests, Flake-Politik
- [`goodworkshop-ci`](.claude/skills/goodworkshop-ci/SKILL.md) — GitHub Actions, Docker-Build, Release nach ghcr.io

Zwei Guardrails werden von ESLint erzwungen und sind kein Stilthema:

- **Keine rohen Hex-Farben** in `src/components`, `src/features`, `src/app`. Kategoriefarben
  laufen über die `.cat-*`-OKLCH-Tokens, Akzente über `--brand-*`.
- **Kein Import des rohen `db`-Handles** außerhalb von `src/server/db`. Jede Query läuft
  durch `withTenant()`, damit `app.tenant_id` gesetzt ist — davon hängt die
  Mandantentrennung ab.

## Docker

```bash
docker build -t goodworkshop .
docker run -p 3000:3000 goodworkshop
```

Das Image ist multi-stage gebaut, läuft als non-root `node`, lädt rund 70 MB herunter
(entpackt etwa 316 MB) und hat einen `HEALTHCHECK` auf `/api/health`, der auch meldet,
welcher Commit läuft. Kein Secret steckt in einem Layer — alles, was zur
Laufzeit gebraucht wird (`DATABASE_URL`, `AUTH_SECRET`, `GW_APP_URL`, …), kommt als
Environment-Variable beim Start.

Releases entstehen aus einem Git-Tag `v*` und landen als Multi-Arch-Image
(`linux/amd64` + `linux/arm64`, jeweils nativ gebaut) inklusive SBOM und Provenance auf
`ghcr.io`.

## Architektur in drei Sätzen

Ein **Modul** (Typ, Dauer, typspezifische Attribute als JSON) hängt an einem **Cluster**
oder direkt an einem **Workshoptag**; ein Tag gehört zu einem **Workshop**. Startzeiten
werden nie gespeichert, sondern aus der Tagesstartzeit und den Dauern berechnet — mit
optionalen gepinnten Blöcken, deren Überschneidungen angezeigt und nie automatisch
aufgelöst werden. Mandantentrennung liegt in Postgres Row Level Security, damit die
Community-Edition (ein Default-Tenant) und die Cloud-Edition denselben Code fahren.

## Lizenz

[AGPL-3.0-only](LICENSE)
