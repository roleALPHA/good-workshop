---
title: KI-Verbindung
description: Wenn Claude, ChatGPT oder ein anderer MCP-Client sich nicht verbindet, 401 oder 429 meldet oder ein Werkzeug mit einer Fehlermeldung abbricht.
sidebar:
  order: 3
---

Ein KI-Assistent verbindet sich über MCP mit GoodWorkshop, entweder mit einem Token oder per OAuth.
Beides richtest du unter **KI-Verbindung** im Profilmenü ein, siehe
[Einen Assistenten verbinden](/de/ai/connect/). Die Server-URL ist immer die Adresse deiner
Installation mit `/api/mcp` dahinter; die Seite **KI-Verbindung** zeigt sie zum Kopieren an.

Fehlermeldungen von Werkzeugen sind **englisch**, weil sie an das Modell gehen, nicht an dich. Die
Texte unten sind darum im Original zitiert.

## Der Client verbindet sich gar nicht

| Was du siehst                                                      | Ursache und Lösung                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude (Web, Desktop, App) oder ChatGPT erreichen den Server nicht | Diese Clients verbinden sich aus der Cloud ihrer Anbieter. Das klappt nur, wenn die Server-URL aus dem Internet per HTTPS erreichbar ist. Eine Installation im Firmennetz erreichen nur Clients auf deinem Rechner, etwa Claude Code oder die Gemini CLI. |
| Die angezeigte Server-URL ist falsch (selbst betrieben)            | Die URL wird aus `GW_APP_URL` gebaut. Korrigiere den Wert, siehe [Konfiguration](/de/self-hosting/configuration/).                                                                                                                                        |
| `method_not_allowed`                                               | Der Client spricht den Server mit GET an. GoodWorkshop nimmt MCP nur per POST entgegen („Streamable HTTP“) und sendet nichts von sich aus. Wähle im Client den Transport HTTP, bei Claude Code und Gemini CLI `--transport http`.                         |

## HTTP 401: `invalid_token`

Der Server hat das Token nicht angenommen. Mögliche Gründe:

- **Das Token wurde zurückgezogen** oder nie vollständig kopiert. Ein Token wird nur einmal im
  Klartext angezeigt, direkt nach **Token anlegen**. Ist es weg, leg ein neues an.
- **„Bearer“ doppelt oder gar nicht.** Der Header lautet `Authorization: Bearer gwp_…`. Langdock
  setzt das Wort „Bearer“ selbst — dort fügst du nur das nackte Token ein.
- **Codex: Die Umgebungsvariable fehlt.** Der Eintrag nennt nur den Namen `GW_TOKEN`. Steht
  `export GW_TOKEN=…` nicht in deiner Shell-Konfiguration, kennt Codex das Token nur in dem einen
  Terminal.
- **Claude Desktop: Leerzeichen im Header.** Claude Desktop trennt `args` an Leerzeichen. Aus
  `"Authorization: Bearer …"` werden zwei Argumente, und der Header fällt still weg. Übernimm die
  Konfiguration genau so, wie die Seite **KI-Verbindung** sie anzeigt: das Token in `env`, im
  Argument `Authorization:${GW_TOKEN}` ohne Leerzeichen.
- **Ein OAuth-Zugang ist abgelaufen oder getrennt.** Verbinde den Client neu.
- **Das Konto ist nicht mehr Mitglied** oder wurde abgeschaltet. Mit der Mitgliedschaft
  verschwinden auch ihre Tokens.

## Probleme mit OAuth und der Freigabeseite

Bei OAuth meldest du dich im Browser bei GoodWorkshop an und bestätigst auf der Seite **Zugriff
erlauben?**, was der Client darf.

:::tip[Erst anmelden, dann verbinden]
Melde dich vorher in diesem Browser bei GoodWorkshop an. Sonst landest du nach der Anmeldung in
der Bibliothek, und du musst das Verbinden im Client neu starten.
:::

Scheitert die Anfrage, zeigt die Freigabeseite den Grund statt eines Knopfs:

| Meldung                                                                 | Bedeutung                                                                  |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| „Diesen Client kennt diese Installation nicht.“                         | Der Client hat sich nicht oder bei einer anderen Installation registriert. |
| „Die Rücksprungadresse gehört nicht zu diesem Client.“                  | Die Rücksprungadresse muss genau einer registrierten entsprechen.          |
| „Diese Anfrage hat einen Antworttyp, den dieser Server nicht anbietet.“ | Der Client fragt etwas anderes als den Autorisierungscode an.              |
| „Diese Anfrage kommt ohne gültiges PKCE. Dieser Server verlangt es.“    | Der Server verlangt PKCE mit S256.                                         |
| „Dieser Zugriff wurde für einen anderen Server angefragt.“              | Der Client hat ein Token für eine andere Server-URL angefragt.             |

In allen Fällen gilt: „Nichts wurde freigegeben. Starte den Vorgang im Client noch einmal — wenn es
wieder scheitert, liegt es an dessen Konfiguration.“

## HTTP 429: `rate_limited`

`/api/mcp` nimmt pro Absenderadresse höchstens **60 Anfragen pro Minute** an. Ein Assistent, der
sehr viele Werkzeuge hintereinander aufruft, kann das erreichen. Warte eine Minute.

Selbst betrieben: Erreichen viele Nutzer die Grenze gleichzeitig, kommt die echte Absenderadresse
vermutlich nicht an — dann teilen sich alle denselben Zähler. Prüfe, ob dein Proxy
`X-Forwarded-For` setzt und ob `GW_TRUSTED_PROXIES` zur Zahl der Proxys passt, siehe
[HTTPS und Reverse Proxy](/de/self-hosting/tls/).

## Ein Werkzeug bricht mit einer Meldung ab

| Meldung des Werkzeugs                                                                                                                     | Bedeutung und Lösung                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `This token does not have the "workshops:write" scope. Create a token with that scope in the settings.`                                   | Dem Token fehlt ein Bereich (hier **Workshops schreiben**). Bereiche lassen sich nicht nachträglich ändern: leg ein neues Token mit den nötigen Bereichen an.                  |
| `You do not have permission for that: …`                                                                                                  | Das Token handelt als du und kann nie mehr als du selbst — dir fehlt das Recht auf diesen Workshop.                                                                            |
| `The workshop has changed in the meantime (expected …, found …).`                                                                         | Jemand anderes hat den Workshop inzwischen geändert. Der Assistent sollte neu lesen und es noch einmal versuchen.                                                              |
| `The collaboration service is unreachable. Nothing can be written without it, because that would mean two write paths onto the same day.` | Schreiben geht nur über den Kollaborationsdienst. Selbst betrieben: Prüfe, ob er läuft und erreichbar ist (`GW_COLLAB_INTERNAL_URL`).                                          |
| `The call failed. The operator can find the cause in the server log under the reference …`                                                | Ein interner Fehler. Wer die Installation betreibt, findet den Grund unter dieser Referenz im Log. In der Cloud nenn die Referenz dem [Support](/de/troubleshooting/support/). |

:::note[Was ein Assistent nie darf]
Weder ein Token noch ein OAuth-Zugang kann Mitglieder einladen, Admins ernennen oder Freigaben
verwalten. Das ist Absicht und lässt sich nicht freischalten.
:::

## Zugang beenden

Ein Token ziehst du unter **KI-Verbindung** mit **Zurückziehen** zurück. Einen OAuth-Zugang beendest
du dort unter **Verbundene Clients** mit **Zugriff entziehen**; er gilt ab der nächsten Anfrage nicht mehr.

## Weiterlesen

- [Einen Assistenten verbinden](/de/ai/connect/)
- [Werkzeug-Referenz](/de/ai/tools/)
- [Übersicht](/de/troubleshooting/overview/)
