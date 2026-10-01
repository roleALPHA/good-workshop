---
title: Blocs et types de blocs
description: Créer, modifier, déplacer et supprimer des blocs – et les champs propres à chaque type de bloc.
sidebar:
  order: 2
---

Un bloc est une ligne du déroulé : un check-in, un apport, une pause. Chaque bloc a un _type de bloc_. Le type détermine la couleur, la durée proposée et les champs que tu peux remplir sous **Plus de champs**.

## Ajouter un bloc

1. Sous le déroulé, clique sur **Ajouter un bloc**.
2. Tape dans le champ **Tape pour filtrer …** pour réduire la liste des types. La durée par défaut de chaque type est indiquée à côté.
3. Clique sur un type, ou appuie sur Entrée pour prendre le premier résultat. Échap referme la liste.

Le nouveau bloc se place à la fin de la journée, porte le nom de son type et en reprend la durée par défaut. Dans un breakout, chaque volet a son propre bouton **Ajouter un bloc**, qui place le bloc directement dans ce volet.

:::caution[Le type se choisit une fois pour toutes]
Tu ne peux plus changer le type d'un bloc par la suite. Si tu t'es trompé, supprime le bloc et recrée-le avec le bon type.
:::

## Le contenu d'une ligne

L'agenda a trois colonnes : **Heure**, **Titre et description** et **Infos complémentaires**. Sur le téléphone, elles deviennent des cartes, où l'essentiel reste modifiable.

- **Heure :** l'heure de début calculée et, en dessous, la durée. Pour la modifier ou fixer une heure, voir [Durée et heures de début](/fr/agenda/timing/).
- **Format :** sous l'heure, via **Choisir la forme de participation** (par exemple **Plénière**, **Petits groupes** ou **Individuel**).
- **Titre :** clique directement dessus et tape. Entrée ou un clic à côté enregistre, Échap annule. Un titre vide n'est pas pris en compte.
- **Responsable :** sous le titre, voir [Responsables](/fr/agenda/responsible/).
- **Description :** en dessous. Sur les grands écrans, tu la modifies directement dans la ligne ; sur les écrans plus étroits, elle est seulement affichée.
- **Matériel :** dans la colonne **Infos complémentaires**, via **+ matériel**. Valide chaque entrée avec Entrée.

Certains types affichent en plus un champ sous forme de petite étiquette dans la colonne **Infos complémentaires**, par exemple la personne qui intervient ou le livrable d'un travail en groupe.

## Plus de champs

Sous chaque bloc figure **Plus de champs**. Un clic déplie les autres champs du type de bloc, **Moins** les replie. Un seul bloc est déplié à la fois, pour que l'agenda reste lisible. Les modifications sont enregistrées dès que tu quittes un champ.

Chaque type a le champ **Notes d'animation**. Il est marqué « rien que pour toi » et n'apparaît pas dans la vue en lecture. À l'impression et à l'export Markdown, les notes ne sont incluses que si tu coches **Avec les notes de modération**. Quand un bloc a des notes, une petite icône à côté de **Plus de champs** le signale.

## Les types de blocs

Tous les types ont **Description**, **Format**, **Matériel** et **Notes d'animation**. Le tableau indique ce qui s'y ajoute. « Pause » dans la troisième colonne signifie que le temps compte dans les pauses du résumé de la journée, et non dans le contenu.

| Type de bloc               | Durée par défaut | Compte comme | Champs propres                                                                                                                   |
| -------------------------- | ---------------: | ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Accueil & organisation** |              10m | Contenu      | Aperçu du programme                                                                                                              |
| **Check-in**               |              15m | Contenu      | Question d'ouverture, Format, Temps par personne (sec.)                                                                          |
| **Apport / présentation**  |              20m | Contenu      | Intervenant·e, Diapositives, Messages clés                                                                                       |
| **Discussion en plénière** |              20m | Contenu      | Question directrice                                                                                                              |
| **Travail en groupe**      |              45m | Contenu      | Consigne de travail, Taille des groupes, Nombre de groupes, Livrable, Disposition de la salle                                    |
| **Session en sous-groupe** |              30m | Contenu      | Consigne de travail, Salle, Disposition de la salle, Taille des groupes, Choix libre du volet, Restitution en plénière, Livrable |
| **Exercice**               |              30m | Contenu      | Consignes, Description de la méthode, Débriefing                                                                                 |
| **Décision / vote**        |              20m | Contenu      | Méthode, Options                                                                                                                 |
| **Réflexion**              |              15m | Contenu      | Question de réflexion, D'abord seul, puis en commun                                                                              |
| **Energizer**              |              10m | Contenu      | Activité, Espace nécessaire                                                                                                      |
| **Pause**                  |              15m | Pause        | –                                                                                                                                |
| **Déjeuner**               |              60m | Pause        | Restauration                                                                                                                     |
| **Marge**                  |              10m | Pause        | –                                                                                                                                |
| **Check-out**              |              15m | Contenu      | Question de clôture, Format                                                                                                      |
| **Prochaines étapes**      |              15m | Contenu      | Noter les responsables, Noter les échéances                                                                                      |
| **Note**                   |               0m | Pause        | –                                                                                                                                |

La **Session en sous-groupe** est prévue pour le travail au sein d'un volet : un petit groupe travaille en parallèle des autres, dans sa propre salle. Le fonctionnement des volets est décrit dans [Sections et breakouts](/fr/agenda/clusters-and-breakouts/).

## Déplacer des blocs

Chaque ligne a une poignée à gauche, qui apparaît dès que tu passes la souris dessus ou que tu cliques dans la ligne. Sur un écran tactile, elle est toujours visible.

- **Souris :** saisis la poignée et fais glisser. Glissé vers la droite, un bloc entre dans la section au-dessus ; vers la gauche, il en ressort.
- **Tactile :** maintiens la poignée appuyée un instant, puis fais glisser. Un simple balayage continue de faire défiler la page.
- **Clavier :** atteins la poignée avec Tab, prends le bloc avec la barre d'espace, déplace-le vers le haut ou le bas avec les flèches, fais-le entrer ou sortir d'une section avec gauche et droite, et dépose-le avec la barre d'espace. Échap annule.

Les heures de début se recalculent d'elles-mêmes après chaque déplacement.

## Mettre de côté ou supprimer

Sous chaque bloc se trouvent deux boutons :

- **Mettre de côté** retire le bloc du déroulé sans le supprimer. Il attend dans la zone [De côté](/fr/agenda/parking/) et ne compte pas dans le temps.
- **Supprimer** le retire définitivement.

:::danger
**Supprimer** ne demande pas de confirmation, et l'éditeur n'a pas d'annulation. Le bloc disparaît immédiatement pour toutes les personnes qui ont la journée ouverte. En cas de doute : mieux vaut **Mettre de côté**.
:::

## Pages associées

- [Durée et heures de début](/fr/agenda/timing/)
- [Sections et breakouts](/fr/agenda/clusters-and-breakouts/)
- [Blocs mis de côté](/fr/agenda/parking/)
- [Imprimer](/fr/sharing/print/)
