---
title: Blocs mis de côté
description: Retirer des blocs du déroulé sans les supprimer, et les réintégrer dans n'importe quelle journée de l'atelier.
sidebar:
  order: 5
---

Tous les blocs préparés n'entrent pas dans le déroulé. L'un saute parce que le temps manque, l'autre est une alternative que tu veux garder sous la main. Plutôt que de supprimer ces blocs, tu les _mets de côté_. Ils gardent leur type, leur durée, leur description et tous leurs champs, mais ne comptent plus dans le temps de la journée.

## Mettre un bloc de côté

1. Passe la souris sur le bloc ou clique dedans.
2. Sous le bloc, clique sur **Mettre de côté**.

Le bloc disparaît du déroulé et se trouve maintenant en bas, dans la zone des blocs mis de côté. Les heures de début des blocs suivants avancent, et le résumé en haut ne le compte plus.

:::note[Les blocs fixés restent où ils sont]
Si un bloc dont l'heure de début est fixée suit le bloc mis de côté, il n'avance pas. Un écart apparaît à la place devant lui, affiché comme **Marge**. La fin de la journée ne change alors pas. Voir [Durée et heures de début](/fr/agenda/timing/).
:::

## La zone « De côté »

Sous le déroulé se trouve la zone intitulée **De côté**, suivie du nombre de blocs, par exemple **De côté (3)**. En dessous, la mention : **Fait partie de l'atelier, ne compte pas dans le temps.** Chaque entrée affiche son titre et sa durée. Quand aucun bloc n'est mis de côté, la zone n'est pas affichée.

Cette zone appartient à _tout l'atelier_, pas à une journée. Tu vois sur chaque journée tous les blocs mis de côté, quelle que soit la journée où ils l'ont été. La zone n'indique pas d'où vient un bloc.

## Remettre un bloc dans le déroulé

Sur le bloc mis de côté, clique sur **Remettre dans le déroulé**. Il va toujours dans la journée que tu as ouverte :

| Où a-t-il été mis de côté ? | Où arrive-t-il ?                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------ |
| Sur cette journée           | À son ancienne place, y compris dans la même section ou le même volet qu'auparavant. |
| Sur une autre journée       | À la fin de cette journée, au niveau de la journée, pas dans une section.            |

De là, tu le fais glisser au bon endroit, voir [Blocs et types de blocs](/fr/agenda/blocks/).

Un bloc qui vient d'une autre journée emporte tout : ses champs, ses responsables et aussi une heure de début fixée. Il reçoit au passage un nouvel identifiant interne. Si le transfert échoue, le bloc retourne dans la zone des blocs mis de côté, et un message en indique la raison.

:::tip[Déplacer un bloc vers une autre journée]
Mets le bloc de côté, passe à la journée cible via les onglets et clique là sur **Remettre dans le déroulé**.
:::

## Quand une journée est supprimée

Si tu supprimes une journée, son déroulé disparaît avec elle. Ses blocs mis de côté, eux, sont conservés : ils passent dans la zone « De côté » de la journée précédente, ou de la suivante si tu supprimes la première journée. Faire le ménage dans une journée ne décide rien des alternatives prévues pour tout l'atelier. Voir [Journées](/fr/agenda/days/).

:::caution[Les sections emportent leurs blocs mis de côté]
Un bloc mis de côté se souvient de la section ou du volet d'où il vient. Si tu supprimes cette section, ce volet ou ce breakout, le bloc mis de côté est supprimé avec, même si le bouton de suppression ne compte que les blocs du déroulé. Pour le garder, remets-le d'abord dans le déroulé avec **Remettre dans le déroulé** et sors-le de la section, ou fais-le venir depuis une autre journée.
:::

## Qui peut faire quoi

- **Mettre de côté** et **Remettre dans le déroulé** pour les blocs de la même journée : toute personne qui peut modifier la journée, y compris les invités avec **Lecture et écriture**.
- Seuls les membres disposant du droit d'écriture peuvent faire venir un bloc d'une _autre journée_. Les invités voient ces entrées, mais sans bouton.
- Qui peut seulement lire voit la zone « De côté », mais ne peut rien déplacer.

Les blocs mis de côté n'apparaissent ni dans le calcul des heures ni dans le résumé de la journée. À l'impression et à l'export d'une journée, ils restent à l'écart, car ils ne font pas partie du déroulé.

## Pages associées

- [Blocs et types de blocs](/fr/agenda/blocks/)
- [Journées](/fr/agenda/days/)
- [Durée et heures de début](/fr/agenda/timing/)
