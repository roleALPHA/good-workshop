---
title: HTTPS und Reverse Proxy
description: HTTPS mit dem mitgelieferten Caddy-Profil oder einem eigenen Reverse Proxy, inklusive WebSocket-Pfad /collab und Streaming.
sidebar:
  order: 3
---

GoodWorkshop gehört hinter HTTPS. Ohne HTTPS gibt es **keine Passkeys**, das Sitzungscookie trägt
kein `Secure` und geht wie die Anmeldelinks im Klartext übers Netz. Du hast zwei Wege: das
mitgelieferte Profil `tls` oder einen eigenen Reverse Proxy.

## Der Container selbst

`app` bindet absichtlich nur an `127.0.0.1` — ohne Proxy davor ist von außen nichts erreichbar,
auch nicht bei falsch eingestellter Firewall. Im Container laufen zwei Dienste:

| Dienst               | Port auf `127.0.0.1` | Variable         | Wofür                                    |
| -------------------- | -------------------- | ---------------- | ---------------------------------------- |
| Anwendung            | `3000`               | `GW_PORT`        | alle Seiten, `/api/…`, `/api/mcp`        |
| Kollaborationsdienst | `3001`               | `GW_COLLAB_PORT` | WebSocket für den Live-Editor, `/collab` |

Den zweiten Port gibt es, weil Next aus einem Route-Handler kein WebSocket-Upgrade bedienen kann.
Beide kommen aus demselben Image.

## Weg 1: Das Profil `tls` (empfohlen)

```bash
docker compose --profile tls up -d
```

Das Profil startet zusätzlich einen Caddy, der die Ports 80 und 443 übernimmt und automatisch ein
Zertifikat von Let's Encrypt holt. Dafür brauchst du:

- `GW_HOSTNAME` in der `.env` — fehlt der Wert, startet Caddy nicht und meldet
  „GW_HOSTNAME must be set: the host name the TLS certificate is issued for.“
- einen Hostnamen, der öffentlich auf diesen Server auflöst
- freie Ports 80 und 443

Der mitgelieferte `Caddyfile` erledigt außerdem:

- Kompression (`encode zstd gzip`)
- den Header `Strict-Transport-Security`
- Zugriffslogs in einem eigenen Volume, die nach 14 Tagen gelöscht werden (`roll_keep_for 336h`)
- die Weiterleitung von `/collab` an den Kollaborationsdienst und von allem anderen an die App

:::note[Hostname im Zertifikat]
Mit dem mitgelieferten Caddy wird dein Hostname zur Ausstellung an Let's Encrypt übermittelt und
erscheint in öffentlichen Certificate-Transparency-Logs. Das ist der Hostname, keine Nutzerdaten.
:::

## Weg 2: Ein eigener Reverse Proxy

Hast du schon einen Proxy auf dem Host (nginx, Traefik, ein eigener Caddy), startest du den Stack
**ohne** das Profil:

```bash
docker compose up -d
```

Dein Proxy muss dann drei Dinge tun.

### 1. `/collab` an Port 3001, mit WebSocket-Upgrade

Alles unter `/collab` geht an den Kollaborationsdienst, und das WebSocket-Upgrade muss
unverändert durchkommen. Landet `/collab` bei der Anwendung auf Port 3000, kann die es nicht
bedienen.

### 2. Alles andere an Port 3000, ohne Pufferung

Next.js streamt Server-Komponenten. Ein Proxy, der Antworten puffert, liefert Seiten erst am
Stück aus. Schalte die Pufferung für diese Route ab.

### 3. Die echte Absenderadresse weitergeben

Die App liest die Absenderadresse aus `X-Forwarded-For` und zählt dabei von rechts so viele
Einträge, wie `GW_TRUSTED_PROXIES` sagt (Standard `1`). Stehen zwei Proxys hintereinander, setze
`2`. Der Wert dient nur der Drosselung und den Logs, nie einer Berechtigung — ein falscher Wert
kostet dich die Drosselung, nicht die Sicherheit.

### Vorlage: der mitgelieferte Caddyfile

So sieht es im Caddyfile des Repos aus. Dort heißen die Ziele `app:3000` und `app:3001`, weil Caddy
im selben Compose-Netz läuft; ein Proxy direkt auf dem Host erreicht dieselben Dienste über
`127.0.0.1` und die Ports aus der Tabelle oben.

```
	handle /collab* {
		reverse_proxy app:3001
	}

	reverse_proxy app:3000 {
		# Next.js streams server components; buffering would make the page appear
		# only in one piece.
		flush_interval -1
	}
```

Die App setzt ihre Sicherheits-Header (CSP, `frame-ancestors`, `nosniff`, Referrer- und
Permissions-Policy, HSTS) selbst; dein Proxy muss sie nicht ergänzen.

### Andere Pfade für den Kollaborationsdienst

Liegt der Kollaborationsdienst nicht unter `/collab` auf demselben Hostnamen, brauchst du
`GW_COLLAB_URL` (die Adresse für den Browser) und gegebenenfalls `GW_COLLAB_INTERNAL_URL` (die
Adresse, über die die App selbst den Dienst erreicht, wenn ein MCP-Schreibzugriff einen Raum
betritt). Für den Normalfall bleiben beide leer.

## Ohne Proxy: SSH-Tunnel

Zum Ausprobieren geht es auch ganz ohne Proxy, über einen Tunnel:

```bash
docker compose up -d
ssh -L 3000:127.0.0.1:3000 server
```

`GW_APP_URL` muss dann auf die Adresse zeigen, die der Browser tatsächlich benutzt. Passkeys
funktionieren ohne HTTPS nur auf `localhost`.

## Prüfen, ob alles ankommt

| Symptom                                                                                                     | Ursache                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Das Zertifikat wird nicht ausgestellt                                                                       | Der Hostname löst nicht auf diesen Server auf, oder 80/443 sind belegt                                                                                          |
| Der Editor zeigt dauerhaft „Keine Verbindung. Deine Änderungen werden übertragen, sobald sie wieder steht.“ | `/collab` wird nicht weitergeleitet, oder `GW_APP_URL` passt nicht zur Adresse im Browser — der Socket lehnt einen fremden Ursprung ab und schreibt das ins Log |
| Seiten erscheinen verzögert und erst vollständig                                                            | Der Proxy puffert die Antworten                                                                                                                                 |
| Kein Passkey angeboten                                                                                      | Kein HTTPS                                                                                                                                                      |
| Claude oder ChatGPT können sich nicht verbinden                                                             | Die Installation ist nicht per HTTPS aus dem Internet erreichbar                                                                                                |

:::caution[Hostname nicht nachträglich wechseln]
Passkeys hängen an `GW_RP_ID`, und das folgt ohne eigenen Wert dem Host aus `GW_APP_URL`. Wer den
Hostnamen ändert, nachdem Passkeys registriert wurden, macht sie alle ungültig.
:::

## Weiterlesen

- [Konfiguration](/de/self-hosting/configuration/)
- [Passkeys](/de/account/passkeys/)
- [Gemeinsam live bearbeiten](/de/agenda/live-editing/)
- [Einen Assistenten verbinden](/de/ai/connect/)
