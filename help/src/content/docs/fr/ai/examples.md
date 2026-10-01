---
title: Exemples
description: Des exemples de demandes à un assistant IA connecté – de la journée d'atelier complète avec breakout jusqu'à l'export – et ce que l'assistant fait alors dans GoodWorkshop.
sidebar:
  order: 4
---

Les demandes suivantes fonctionnent avec n'importe quel assistant connecté, que ce soit Claude, ChatGPT ou Gemini. Tu écris tout à fait normalement, en français ou dans une autre langue. Sous chaque demande figurent les [outils](/fr/ai/tools/) que l'assistant utilise généralement. La façon exacte de procéder, c'est le modèle qui la choisit.

Condition préalable : l'assistant est [connecté](/fr/ai/connect/) et, pour tout ce qui écrit, il dispose du périmètre **Écrire les ateliers**.

## 1. Planifier toute une journée d'atelier avec un breakout

> Crée un atelier « Journée d'équipe Ventes » le 12 mars. Début à 9h00. D'abord l'accueil et un check-in, puis un apport sur la planification annuelle, ensuite 60 minutes en sous-groupes dans trois salles – clients existants, nouveaux clients, partenaires – chacun avec une phase de travail et un paperboard de résultats. Puis le déjeuner, l'après-midi la restitution en plénière, la décision sur les trois mesures les plus importantes et un check-out.

Ce que fait l'assistant :

1. `list_module_types` – découvre les types de blocs de ton espace de travail, par exemple Check-in, Apport / présentation, Session en sous-groupe, Déjeuner.
2. `create_workshop` avec le titre et la date – crée l'atelier avec sa première journée.
3. `apply_agenda` – écrit toute la journée en **un seul** appel. Les sous-groupes deviennent un breakout avec trois volets qui se déroulent en même temps, chacun avec ses propres blocs.

Tu n'as pas besoin d'indiquer les heures de début : GoodWorkshop les calcule à partir du début et des durées. Plus d'informations sur la structure dans [Sections et breakouts](/fr/agenda/clusters-and-breakouts/).

:::tip[Faire montrer d'abord, puis écrire]
Ajoute « Montre-moi le déroulé avant de le créer » si tu veux d'abord y jeter un œil.
:::

## 2. Ajouter une deuxième journée

> Ajoute à la journée d'équipe une deuxième journée le 13 mars, début à 8h30, une demi-journée : retour sur le jour 1, planification des mesures en binômes, clôture.

L'assistant cherche l'atelier avec `list_workshops`, crée la journée avec `create_day` et la remplit avec `apply_agenda`.

## 3. Mettre un bloc de côté et le reprendre plus tard

> Dans la journée d'équipe, mets de côté l'apport sur la planification annuelle, on a besoin du temps pour les sous-groupes. Allonge le breakout de 20 minutes en contrepartie.

1. `get_workshop` – lit la journée avec tous les ID.
2. `update_modules` – met `parked: true` sur l'apport et modifie les durées des blocs dans les volets, en un seul appel.

Le bloc est conservé [de côté](/fr/agenda/parking/). Plus tard :

> Remets l'apport mis de côté au jour 2, juste après le retour sur le jour 1.

L'assistant utilise `move_module` avec `toDayId` et place le bloc à l'endroit voulu.

## 4. Caler une pause sur une heure fixe

> Le déjeuner doit commencer à 12h30, quoi qu'il se passe avant.

L'assistant fixe une heure de début avec `update_module` (`pinnedStartMinute: 750`). Si la matinée dure plus longtemps, GoodWorkshop signale un chevauchement – voir [Durée et heures de début](/fr/agenda/timing/).

## 5. Indiquer les responsables

> Indique Anna Berger comme responsable de tous les blocs du matin, et pour les sous-groupes en plus une personne de l'équipe clients pour chacun : M. Kaya, Mme Lind et Mme Novak.

L'assistant modifie tous les blocs concernés avec `update_modules` en un seul appel. GoodWorkshop reconnaît les membres de ton espace de travail à leur **nom complet exact**. Les personnes qui ne correspondent pas – ici celles qui ne sont nommées que par leur nom de famille – sont inscrites comme personnes externes. L'assistant ne reçoit pas de liste des membres. Plus d'informations dans [Responsables](/fr/agenda/responsible/).

## 6. Exporter l'atelier et le réutiliser

> Récupère la journée d'équipe sous forme de texte et rédige à partir de là un court e-mail d'invitation aux participants, en anglais. Sans mes notes d'animation.

L'assistant appelle `export_workshop` – avec `locale: en` et sans les notes – et reçoit tout l'atelier en Markdown, toutes les journées dans l'ordre. Il en tire l'e-mail. Tu obtiens le même document dans l'application via l'[export Markdown](/fr/sharing/export/).

## 7. Ranger la bibliothèque

> Range tous les ateliers qui ont « Ventes » dans leur titre dans un nouveau dossier « Ventes 2026 » et donne-leur le tag « interne ».

`create_folder`, puis `list_workshops` avec une recherche, et pour chaque atelier `move_workshop` et `set_workshop_tags`. Les ateliers que tu peux seulement lire, l'assistant les laisse de côté – il ne peut jamais faire plus que toi.

:::caution[Les tags sont remplacés]
`set_workshop_tags` définit la liste **complète**. Demande donc expressément de conserver les tags existants si tu veux seulement en ajouter un.
:::

## 8. Reprendre une méthode (Cloud uniquement)

> Cherche-moi dans la collection de méthodes une courte entrée en matière pour 20 personnes, 15 minutes maximum. Montre-moi deux propositions, et celle que je choisis, ajoute-la au début du jour 2.

1. `list_discover_entries` avec `groupSize` et `maxMinutes`.
2. `get_discover_entry` – te montre les propositions avec tous leurs blocs.
3. Après ton choix, `adopt_discover_entry` avec l'atelier et la journée. Le bloc arrive sous forme de copie à la **fin** de la journée ; l'assistant le déplace ensuite au début avec `move_module`.

Uniquement dans [GoodWorkshop Cloud](/fr/cloud/discover/).

## Ce qui ne marche pas

> Partage la journée d'équipe avec mon collègue.

L'assistant refuse ou te renvoie vers l'application : les partages, les [liens d'invitation](/fr/sharing/share-links/) et les membres ne sont délibérément pas accessibles via MCP. Le partage, tu le fais toi-même sous **Accès** – voir [Partager avec des personnes](/fr/sharing/share-with-people/).

## Conseils pour de bons résultats

- **Donne le cadre** : date, début, taille du groupe, salles, horaires fixes comme le déjeuner.
- **Dis s'il faut remplacer ou compléter.** Si tout le déroulé doit être réécrit, l'assistant peut remplacer la journée (`mode: replace`) ; sinon il ajoute à la suite.
- **Fais-toi montrer les étapes intermédiaires** quand une journée est déjà ouverte chez d'autres – les modifications apparaissent immédiatement lors de la [modification à plusieurs](/fr/agenda/live-editing/).
- **Suppression définitive uniquement sur demande expresse.** Pour `purge_workshop`, il faut ta demande claire.

## Voir aussi

- [Référence des outils](/fr/ai/tools/)
- [Planifier avec l'assistant IA](/fr/ai/introduction/)
- [Connecter un assistant](/fr/ai/connect/)
