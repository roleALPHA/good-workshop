---
name: hilfe
description: 'Bei JEDER Änderung und JEDEM Feature in GoodWorkshop prüfen, ob die Hilfe unter doc.goodworkshop.org (Quelle help/, de/en/fr/es) noch stimmt, und sie gegebenenfalls nachziehen – nicht nur die Seite zur Funktion, sondern jede Seite, deren Aussage dadurch falsch oder unvollständig wird. Nimm diesen Skill IMMER, bevor eine Änderung committet oder als PR geöffnet wird: Funktion, Fix, Rechte, Sichtbarkeit, UI-Text, MCP-Werkzeug, Konfiguration, Betrieb – auch wenn niemand „Hilfe“ sagt und auch wenn am Ende nichts zu ändern ist. Ebenso bei „steht das in der Hilfe?“, „Doku nachziehen“, „Hilfeseite“, „doc.goodworkshop.org“.'
---

# hilfe

**The binding content is in [`help/README.md`](../../../help/README.md),** section "Every
change is checked against the help". Follow it before every commit or pull request — also when
the answer is "nothing affected", which then goes into the pull request as a `Hilfe: …` line.

It lives there rather than here on purpose: the rules apply to every contribution, not only to
somebody working with a particular tool — and `.claude/` is not part of the repository. A
second copy here would drift.
