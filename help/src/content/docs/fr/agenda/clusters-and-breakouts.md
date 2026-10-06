---
title: Sections et breakouts
description: Regrouper des blocs en sections, planifier des petits groupes en parallèle dans un breakout avec des volets, et y faire entrer ou sortir des blocs.
sidebar:
  order: 4
---

Une longue journée se lit plus facilement en chapitres. Il existe pour cela deux sortes de conteneurs :

|               | **Section**                         | **Breakout**                                   |
| ------------- | ----------------------------------- | ---------------------------------------------- |
| Contient      | des blocs                           | des volets, et chaque volet contient des blocs |
| Dans le temps | l'un après l'autre                  | tous les volets en même temps                  |
| Durée         | somme des blocs                     | durée du volet le plus long                    |
| Usage typique | « Arrivée & cadre », « Après-midi » | petits groupes dans des salles séparées        |

## Sections

Une section regroupe des blocs qui se déroulent l'un après l'autre. Son en-tête affiche le nom, le nombre de blocs et la durée totale, par exemple « 3 blocs · 35m ». Sur le téléphone, l'en-tête reste en haut pendant le défilement, pour que tu saches dans quelle section tu te trouves.

### Créer une section

1. Sous le déroulé, clique sur **Ajouter une section**.
2. La section apparaît à la fin de la journée sous le nom **Nouvelle section**. Le nom est déjà sélectionné, tu peux donc taper directement.
3. Fais-y glisser les blocs qui en font partie (voir plus bas).

Pour placer la section directement au bon endroit, prends le « + » sur la ligne entre deux lignes du déroulé et choisis **Section** – voir [Blocs et types de blocs](/fr/agenda/blocks/). Sous le dernier bloc d'une section, la nouvelle section se place juste après elle.

### Nom et couleur

Clique sur le nom pour le modifier (**Nom de la section**). À droite dans l'en-tête, choisis sous **Couleur de la section** une couleur de la palette, ou **Sans couleur**. La couleur ne colore que l'en-tête ; les blocs gardent la couleur de leur type.

### Supprimer une section

Le bouton de suppression dans l'en-tête indique ce qui part avec, par exemple **Supprimer avec 3 blocs**.

:::danger
Une section est supprimée _avec tous les blocs qu'elle contient_, sans confirmation et sans annulation. Si tu veux garder les blocs, sors-les d'abord.
:::

## Breakouts

Un breakout est une section dont les _volets se déroulent en même temps_ : des petits groupes en parallèle, chacun avec son propre petit déroulé. Tous les volets commencent quand le breakout commence. Le breakout se termine quand le volet le plus long se termine, puis la journée continue.

L'en-tête le dit en toutes lettres, par exemple **3 volets, en même temps · volet le plus long 45m**. Chaque volet indique sa position, son horaire et sa durée, par exemple « Volet 2 sur 3 · 10:00–10:45 · 45m ». Sur un grand écran, les volets sont disposés en colonnes côte à côte ; sur le téléphone, les uns sous les autres.

### Créer un breakout

1. Sous le déroulé, clique sur **Ajouter un breakout**.
2. Il apparaît à la fin de la journée sous le nom **Nouveau breakout**, déjà avec deux volets, « Nouveau volet 1 » et « Nouveau volet 2 ».
3. Renomme le breakout et les volets (**Nom du breakout**, **Nom du volet**).
4. Remplis chaque volet avec son propre bouton **Ajouter un bloc**.
5. Ajoute d'autres groupes avec **Ajouter un volet**, à la fin des colonnes.

Comme une section, un breakout peut aussi être créé directement à sa place via le « + » entre deux lignes, avec **Breakout**.

Le breakout et les volets ont chacun leur propre couleur (**Couleur du breakout**, **Couleur du volet**). Un volet sans bloc affiche **Aucun bloc pour l’instant.**

:::tip
Pour le travail dans un volet, il existe le type de bloc **Session en sous-groupe**, avec des champs comme **Salle** et **Choix libre du volet**. Voir [Blocs et types de blocs](/fr/agenda/blocks/).
:::

### Comment un breakout est compté

Dans le résumé de la journée (**contenu**, **pauses**, nombre de blocs), seul le volet le plus long est pris en compte. Ainsi, « contenu plus pauses » reste égal au temps entre le début et la fin. Une pause qui ne figure que dans un volet plus court n'apparaît donc pas dans le temps de pause de la journée. Dans le volet lui-même, elle figure avec son heure.

### Supprimer

Un breakout est supprimé avec tous ses volets et blocs (**Supprimer avec 3 volets**). Un volet seul part avec ses blocs (**Supprimer avec 2 blocs**). Là non plus, aucune confirmation n'est demandée.

## Faire entrer et sortir

Tu déplaces blocs, sections et breakouts par la poignée à gauche de la ligne, comme décrit dans [Blocs et types de blocs](/fr/agenda/blocks/). Ce qui se passe au dépôt dépend de l'endroit où tu relâches :

- **Bloc dans une section :** entre deux blocs d'une section, il atterrit toujours dans la section. Juste sous le dernier bloc, ou sous l'en-tête d'une section vide, c'est le mouvement horizontal qui décide : glissé vers la droite, il atterrit dans la section ; vers la gauche, au niveau de la journée. Au clavier, flèche droite et flèche gauche le font entrer et sortir.
- **Bloc dans un breakout :** la colonne sous le pointeur de la souris est le volet où il atterrit. Si tu le relâches sur l'en-tête du breakout, il va à la fin du premier volet. Au clavier, flèche gauche et flèche droite passent d'un volet à l'autre.
- **Section dans un breakout :** la section devient un volet de plus, avec tous ses blocs.
- **Volet hors d'un breakout :** fais-le glisser au niveau de la journée, et il devient une section à part, avec tous ses blocs.

Un conteneur emporte tout ce qu'il contient quand tu le déplaces. Les heures se recalculent après le dépôt.

:::note[Deux niveaux au maximum]
L'imbrication est limitée : une section contient des blocs, un breakout contient des volets, un volet contient des blocs. Une section ne peut pas être placée dans une autre section, un breakout dans aucun autre conteneur, et un bloc n'est jamais directement dans le breakout, mais toujours dans un volet.
:::

## Fixer l'heure de début

Comme les blocs, les sections et les breakouts peuvent être fixés à une heure, via le cadenas de l'en-tête. Les volets individuels non : ils commencent toujours avec leur breakout. Pour en savoir plus, voir [Durée et heures de début](/fr/agenda/timing/).

## Pages associées

- [Blocs et types de blocs](/fr/agenda/blocks/)
- [Durée et heures de début](/fr/agenda/timing/)
- [Modifier ensemble en direct](/fr/agenda/live-editing/)
