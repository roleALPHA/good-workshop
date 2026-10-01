---
title: Référence des outils
description: Tous les outils que le serveur MCP de GoodWorkshop propose à un assistant IA – avec leur rôle, les paramètres importants et le périmètre requis.
sidebar:
  order: 3
---

Cette page liste chaque outil que GoodWorkshop propose à un assistant connecté. Tu n'as pas à appeler les outils toi-même – l'assistant les choisit d'après ta demande. La référence t'aide à évaluer ce qui est possible et à comprendre une réponse de l'assistant.

Les noms d'outils, les paramètres et les descriptions sont en anglais, parce qu'ils sont écrits pour le modèle. Tes demandes, tu les formules dans n'importe quelle langue.

## Comment lire

**Périmètre** indique de quelle autorisation l'outil a besoin (voir [Connecter un assistant](/fr/ai/connect/)) :

| Abréviation | Périmètre                                         |
| ----------- | ------------------------------------------------- |
| L           | **Lire les ateliers** (`workshops:read`)          |
| E           | **Écrire les ateliers** (`workshops:write`)       |
| T           | **Lire les types de blocs** (`module_types:read`) |

S'y ajoutent toujours tes propres droits sur l'atelier : ce que tu peux seulement lire, l'assistant ne peut pas non plus le modifier.

**Les heures** sont des minutes depuis minuit : `540` correspond à 09:00. **Les durées** sont en minutes.

**Les ID** sont de longs identifiants que l'assistant reprend de réponses précédentes, par exemple de `list_workshops` ou `get_workshop`.

**`expectedVersion`** est accepté par tous les outils qui modifient le contenu d'une journée. L'assistant envoie la version qu'il a lue en dernier. Si l'atelier a changé depuis – par exemple parce que tu le modifies en parallèle –, la modification est refusée au lieu d'écraser ton travail.

## Bibliothèque et dossiers

| Outil           | Ce qu'il fait                                                                                                | Paramètres importants                            | Périmètre |
| --------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | --------- |
| `list_folders`  | Renvoie l'arborescence des dossiers dans l'ordre d'affichage.                                                | –                                                | L         |
| `create_folder` | Crée un dossier, à la racine ou dans un autre dossier. Les noms sont uniques entre dossiers voisins.         | `name`, `parentId`                               | E         |
| `move_folder`   | Déplace un dossier avec son contenu. Réservé aux admins de l'espace de travail.                              | `folderId`, `parentId` (null = niveau supérieur) | E         |
| `delete_folder` | Supprime un dossier. Les sous-dossiers et ateliers qu'il contient remontent d'un niveau. Réservé aux admins. | `folderId`                                       | E         |
| `list_tags`     | Renvoie tous les [tags](/fr/library/tags/) utilisés avec leur nombre.                                        | –                                                | L         |

## Ateliers

| Outil               | Ce qu'il fait                                                                                                                                                                          | Paramètres importants                                                                                                | Périmètre |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------- |
| `list_workshops`    | Renvoie les ateliers que tu as le droit d'ouvrir, les derniers modifiés en premier, page par page.                                                                                     | `folderId`, `tagId`, `search` (partie du titre), `cursor`, `limit` (1–100)                                           | L         |
| `create_workshop`   | Crée un atelier avec sa première journée.                                                                                                                                              | `title`, `folderId`, `date` (date de la première journée, AAAA-MM-JJ)                                                | E         |
| `rename_workshop`   | Modifie le titre.                                                                                                                                                                      | `workshopId`, `title`                                                                                                | E         |
| `move_workshop`     | Range un atelier dans un dossier ou l'en sort.                                                                                                                                         | `workshopId`, `folderId` (null = sans dossier)                                                                       | E         |
| `set_workshop_tags` | Remplace les tags par la liste complète indiquée. Les nouveaux tags sont créés au passage ; une liste vide les retire tous.                                                            | `workshopId`, `tags` (jusqu'à 24)                                                                                    | E         |
| `export_workshop`   | Renvoie tout l'atelier sous forme d'un document Markdown, toutes les journées dans l'ordre – comme l'[export Markdown](/fr/sharing/export/). Notes d'animation uniquement sur demande. | `workshopId`, `flavor` (`agenda` = tableau, `outline` = titres et texte), `locale` (`de`, `en`, `fr`, `es`), `notes` | L         |

`move_workshop`, `rename_workshop` et `set_workshop_tags` exigent au moins le droit **Modifier** sur l'atelier.

## Corbeille

Seul le ou la propriétaire de l'atelier ou un admin de l'espace de travail peut utiliser ces outils – comme dans l'application (voir [Corbeille](/fr/library/trash/)).

| Outil              | Ce qu'il fait                                                                                                                            | Paramètres importants | Périmètre |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | --------- |
| `trash_workshop`   | Met un atelier à la corbeille. Rien n'est perdu.                                                                                         | `workshopId`          | E         |
| `list_trash`       | Renvoie les ateliers de la corbeille, les derniers supprimés en premier.                                                                 | –                     | L         |
| `restore_workshop` | Restaure un atelier avec son dossier et ses tags.                                                                                        | `workshopId`          | E         |
| `purge_workshop`   | Supprime un atelier **définitivement**, avec toutes ses journées et tous ses blocs. Uniquement pour les ateliers déjà dans la corbeille. | `workshopId`          | E         |

:::danger[`purge_workshop` est irréversible]
L'assistant a pour consigne de n'utiliser cet outil que si tu demandes expressément une suppression définitive.
:::

## Journées

| Outil           | Ce qu'il fait                                                                                                                                                                                                      | Paramètres importants                                         | Périmètre |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- | --------- |
| `list_days`     | Renvoie les journées d'un atelier dans l'ordre.                                                                                                                                                                    | `workshopId`                                                  | L         |
| `create_day`    | Ajoute une journée à la fin. Sans heure de début, elle reprend celle de la dernière journée.                                                                                                                       | `workshopId`, `title`, `date`, `startMinute`                  | E         |
| `update_day`    | Modifie le nom, la date, le début ou la note d'une journée ; ce qui est omis reste inchangé. `date: null` retire la date, un `note` vide la note.                                                                  | `workshopId`, `dayId`, `title`, `date`, `startMinute`, `note` | E         |
| `set_day_start` | Fixe uniquement le début d'une journée.                                                                                                                                                                            | `workshopId`, `dayId`, `startMinute`                          | E         |
| `move_day`      | Modifie l'ordre des journées.                                                                                                                                                                                      | `workshopId`, `dayId`, `afterId` (null = au début)            | E         |
| `delete_day`    | Supprime une journée avec son déroulé. Les blocs mis de côté sont conservés et passent à la journée précédente (pour la première journée, à la suivante). La dernière journée restante ne peut pas être supprimée. | `workshopId`, `dayId`                                         | E         |

Plus d'informations sur les journées dans [Journées](/fr/agenda/days/).

## Lecture

| Outil               | Ce qu'il fait                                                                                                                                                                   | Paramètres importants                                                                                         | Périmètre |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------- |
| `list_module_types` | Renvoie tous les [types de blocs](/fr/agenda/blocks/) disponibles avec leur identifiant, leur durée par défaut et leurs champs. L'assistant l'appelle avant de créer des blocs. | –                                                                                                             | T         |
| `get_workshop`      | Lit une journée : heures de début calculées, tous les ID, sections et breakouts, blocs mis de côté de cette journée et des autres, plus la version actuelle.                    | `workshopId`, `dayId` (sans : première journée), `view` (`outline` ou `markdown`), `locale` (pour `markdown`) | L         |

## Agenda complet

| Outil            | Ce qu'il fait                                                                                                                                                                                                                                     | Paramètres importants                                                                                                 | Périmètre |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------- |
| `apply_agenda`   | Écrit tout le déroulé d'une journée d'un seul coup, chaque bloc avec tous ses champs. **Tout ou rien** : si un bloc nomme un type inconnu ou si ses champs ne conviennent pas, rien n'est écrit, et tous les problèmes sont signalés en une fois. | `workshopId`, `dayId`, `mode` (`append` = ajouter à la suite, par défaut ; `replace` = remplacer la journée), `items` | E         |
| `update_modules` | Modifie les champs de nombreux blocs et sections d'une journée en un seul appel ; les ID restent les mêmes. Également tout ou rien.                                                                                                               | `workshopId`, `dayId`, `updates` (1–500 entrées, chacune `moduleId` plus des champs comme pour `update_module`)       | E         |

### Structure de `items`

Chaque entrée de `items` a un genre (`kind`) :

| `kind`     | Signification                                                                                                      | Contenu                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `module`   | un bloc                                                                                                            | `typeKey` (de `list_module_types`) et les champs de bloc ci-dessous                                                     |
| `cluster`  | une [section](/fr/agenda/clusters-and-breakouts/) dont les blocs se suivent                                        | `title`, `color`, `pinnedStartMinute`, `children` (blocs)                                                               |
| `breakout` | un breakout : des volets qui se déroulent **en même temps**, par exemple des sous-groupes dans des salles séparées | `title`, `color`, `pinnedStartMinute`, `children` (volets avec `title`, `color` et leurs propres blocs dans `children`) |

Tous les volets d'un breakout commencent avec lui ; il se termine quand le volet le plus long se termine. Les blocs sont toujours rattachés à un volet, jamais directement au breakout. Un breakout se trouve toujours au niveau de la journée, jamais dans un autre.

### Champs de bloc

| Champ               | Signification                                                                                                                                                                                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`             | titre du bloc                                                                                                                                                                                                    |
| `durationMinutes`   | durée en minutes                                                                                                                                                                                                 |
| `pinnedStartMinute` | heure de début fixe (voir [Durée et heures de début](/fr/agenda/timing/)) ; `null` la libère                                                                                                                     |
| `desc`              | les champs du type de bloc, par exemple description, matériel ou intervenant·e – vérifiés par rapport à son schéma                                                                                               |
| `parked`            | `true` met le bloc [de côté](/fr/agenda/parking/)                                                                                                                                                                |
| `responsible`       | qui est responsable du bloc, jusqu'à 20 personnes : un membre par `memberId` ou par son nom complet exact, les autres seulement par leur nom ; `[]` vide la liste (voir [Responsables](/fr/agenda/responsible/)) |
| `color`             | uniquement pour les sections : `rose`, `red`, `orange`, `amber`, `emerald`, `teal`, `cyan`, `blue`, `violet`, `slate`                                                                                            |

## Blocs individuels

| Outil           | Ce qu'il fait                                                                                                                                                                  | Paramètres importants                                                                                         | Périmètre |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | --------- |
| `add_module`    | Ajoute un seul bloc à la fin de la journée ou d'une section ou d'un volet.                                                                                                     | `workshopId`, `dayId`, `typeKey`, `title`, `durationMinutes`, `clusterId`                                     | E         |
| `add_cluster`   | Ajoute une section à la fin de la journée. Avec `mode: parallel`, elle devient un breakout ; un volet est une section dont `parentClusterId` = le breakout.                    | `workshopId`, `dayId`, `title`, `color`, `mode` (`sequential` ou `parallel`), `parentClusterId`               | E         |
| `update_module` | Modifie les champs d'un bloc ou d'une section ; ce qui est omis reste inchangé. `desc` remplace toute la description.                                                          | `workshopId`, `dayId`, `moduleId` et les champs de bloc                                                       | E         |
| `move_module`   | Déplace un bloc ou une section au sein de la journée – ou, avec `toDayId`, un bloc à la fin d'une autre journée du même atelier. Il y reçoit un nouvel ID.                     | `workshopId`, `moduleId`, `dayId` (où il se trouve actuellement), `clusterId`, `afterId`, `toDayId`, `parked` | E         |
| `delete_module` | Supprime un bloc définitivement. Une section supprimée emporte ses blocs du déroulé, un breakout supprimé ses volets avec leur contenu ; les blocs mis de côté sont conservés. | `workshopId`, `dayId`, `moduleId`                                                                             | E         |

Tous les outils pour les journées et les blocs exigent au moins le droit **Modifier** sur l'atelier.

:::tip[Mettre de côté plutôt que supprimer]
Avec `update_module` et `parked: true`, l'assistant retire un bloc du planning sans le supprimer. Les blocs [mis de côté](/fr/agenda/parking/) appartiennent à tout l'atelier : `get_workshop` montre aussi ce qui est mis de côté sur d'autres journées, et `move_module` avec `toDayId` ramène un bloc de là-bas dans une autre journée.
:::

## Découvrir des méthodes (Cloud uniquement)

:::note[Uniquement dans GoodWorkshop Cloud]
Ces quatre outils n'existent que dans [GoodWorkshop Cloud](/fr/cloud/overview/). Une installation auto-hébergée ne les propose pas du tout. Plus d'informations dans [Découvrir des méthodes](/fr/cloud/discover/).
:::

| Outil                   | Ce qu'il fait                                                                                                                                                                                                                                                                                                                                                                                  | Paramètres importants                                                                                                                | Périmètre |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| `list_discover_filters` | Renvoie les filtres de la collection de méthodes avec leurs valeurs actuelles.                                                                                                                                                                                                                                                                                                                 | `locale`                                                                                                                             | L         |
| `list_discover_entries` | Parcourt la collection de méthodes, les plus récentes en premier. Une entrée comporte une ou plusieurs journées – un seul bloc ou tout un programme.                                                                                                                                                                                                                                           | `facets` (valeurs de `list_discover_filters` ; toutes doivent correspondre), `groupSize`, `maxMinutes`, `search`, `cursor`, `locale` | L         |
| `get_discover_entry`    | Montre une entrée journée par journée avec tous les blocs et toutes les durées. L'assistant doit te la montrer avant de reprendre quoi que ce soit.                                                                                                                                                                                                                                            | `entryId`, `locale`                                                                                                                  | L         |
| `adopt_discover_entry`  | Reprend une entrée sous forme de copie : sans `workshopId`, comme nouvel atelier ; avec `workshopId`, comme journées supplémentaires à la fin ; avec `workshopId` et `dayId`, les blocs à la fin de cette journée (uniquement pour les entrées d'une seule journée). Le nom et le début de la journée restent inchangés. Un bloc dont le type n'existe pas chez toi arrive sous forme de note. | `entryId`, `workshopId`, `dayId`, `title`, `folderId`, `locale`                                                                      | E         |

## Ce qui n'existe pas

Aucun outil ne gère les membres, les partages, les liens d'invitation ou les jetons. Il n'en existe pas non plus qui liste les membres de ton espace de travail. C'est voulu – voir [Planifier avec l'assistant IA](/fr/ai/introduction/).

## Voir aussi

- [Exemples](/fr/ai/examples/)
- [Connecter un assistant](/fr/ai/connect/)
- [Sections et breakouts](/fr/agenda/clusters-and-breakouts/)
- [Blocs et types de blocs](/fr/agenda/blocks/)
