---
title: Modifier ensemble en direct
description: Travailler à plusieurs en même temps sur une journée d'atelier – qui est présent, comment les modifications se combinent et ce qui se passe en cas de coupure de connexion.
sidebar:
  order: 7
---

Toutes les personnes autorisées à modifier un atelier travaillent dans le même document. Si quelqu'un modifie un titre, déplace un bloc ou met quelque chose de côté, les autres le voient immédiatement, sans recharger. Il n'y a ni bouton d'enregistrement ni mode édition. Chaque modification est transmise automatiquement.

Le partage se fait _par journée_. Qui a ouvert la Journée 1 voit immédiatement les modifications de la Journée 1 ; ce qui se passe sur la Journée 2, tu le vois dès que tu y passes.

## Qui est présent

Dès qu'une autre personne a ouvert la même journée, une barre de badges apparaît au-dessus de l'agenda, un par personne, avec les initiales et le nom. Si tu es seul, la barre n'apparaît pas.

Quand quelqu'un travaille dans un bloc, ce bloc a un cadre coloré et, en haut à droite, un badge avec le nom. S'il y a plusieurs personnes, on y lit par exemple « Mira +1 ». Chaque personne a sa propre couleur, la même sur tous les appareils. La couleur n'est jamais la seule information : le nom est toujours indiqué.

:::note[L'assistant IA travaille de façon visible]
Quand un assistant IA connecté écrit dans la journée, il apparaît dans la même barre, avec une icône de robot et le libellé **Assistant IA**. Ses modifications apparaissent immédiatement chez tout le monde, exactement comme celles d'une personne. Voir [Planifier avec l'assistant IA](/fr/ai/introduction/).
:::

## Quand une modification est transmise

| Quoi                                                    | Transmis                                 |
| ------------------------------------------------------- | ---------------------------------------- |
| Titre, durée, description                               | avec Entrée ou quand tu quittes le champ |
| **Note sur la journée**, champs sous **Plus de champs** | quand tu quittes le champ                |
| Déplacer, mettre de côté, supprimer, fixer              | immédiatement                            |
| Durée avec les flèches                                  | à chaque pression de touche              |

Tant que quelque chose est encore en cours de transmission, **Enregistrement …** s'affiche brièvement sous l'agenda. À l'ouverture d'une journée, tu verras peut-être **Connexion …**. Quand tout fonctionne normalement, GoodWorkshop n'affiche aucun statut.

## Quand deux personnes modifient la même chose

Vous pouvez travailler en même temps sur des blocs différents sans vous gêner. Deux personnes qui déplacent en même temps des blocs différents ne se dérangent pas non plus.

Sur un même bloc, chaque champ est enregistré séparément : le **Titre**, la **Durée**, l'heure de début fixée, **Responsable**, la description, le **Format**, le matériel et chaque champ sous **Plus de champs**. Si l'une modifie la description et l'autre le format, les deux modifications sont conservées.

### Un champ, une personne

Tant que quelqu'un écrit dans un champ, ce champ lui appartient. Pour tous les autres, il est verrouillé et entouré d'un cadre coloré, et en dessous on lit par exemple « Mira est en train d’écrire ». Les autres champs du même bloc restent libres. Cela vaut aussi pour le nom d'une section et la **Note sur la journée**.

Le champ redevient libre

- dès que la personne le quitte,
- après 30 secondes sans frappe – ce qu'elle a écrit jusque-là est enregistré,
- dès qu'elle ferme l'onglet ou le navigateur,
- au plus tard après environ 20 secondes si sa connexion est coupée sans déconnexion, par exemple parce que l'ordinateur portable est refermé ou que le wifi a disparu.

Si deux personnes cliquent au même moment dans le même champ, c'est celle qui était là en premier qui l'obtient. Pour l'autre, il est verrouillé.

:::caution[L'assistant IA ne respecte pas les verrous]
Si l'[assistant IA](/fr/ai/introduction/) modifie un champ dans lequel quelqu'un est en train d'écrire, sa modification remplace le texte qui n'est pas encore enregistré.
:::

Il n'y a pas d'annulation. Ce que quelqu'un supprime disparaît pour tout le monde. En cas de doute, mieux vaut mettre de côté, voir [Blocs mis de côté](/fr/agenda/parking/).

## Connexion perdue

Si la connexion est interrompue, par exemple dans le train ou sur le wifi d'un hôtel de séminaire, un message apparaît :

**Pas de connexion. Tes modifications seront transmises dès qu'elle revient.**

Tu peux continuer à travailler. GoodWorkshop essaie de lui-même de rétablir la connexion, rapidement au début, puis à intervalles plus longs, de 15 secondes au maximum. Une fois la connexion rétablie, tes modifications sont transmises et fusionnées avec celles des autres. Les badges des autres disparaissent tant que tu es hors ligne.

:::danger[Ne recharge pas tant que le message est affiché]
Tes modifications faites hors ligne ne se trouvent que dans cet onglet du navigateur. Si tu recharges la page ou fermes l'onglet avant le retour de la connexion, elles sont perdues. Attends que le message disparaisse.
:::

Si la connexion est là mais qu'une modification n'est pas encore arrivée sur le serveur, le navigateur t'avertit avec sa propre boîte de dialogue quand tu quittes la page.

## Qui travaille en direct

- Les membres disposant du droit d'écriture et les invités avec **Lecture et écriture** travaillent en direct dans le même document.
- Qui peut seulement lire obtient la vue en lecture. Elle montre l'état au moment de l'ouverture de la page et ne se met pas à jour d'elle-même. Recharger affiche l'état actuel.

Si l'accès d'une personne est retiré pendant qu'elle a la journée ouverte, elle ne peut plus rien transmettre à partir de ce moment. La manière d'accorder un accès est décrite dans [Partager avec des personnes](/fr/sharing/share-with-people/).

## Pages associées

- [Partager avec des personnes](/fr/sharing/share-with-people/)
- [Planifier avec l'assistant IA](/fr/ai/introduction/)
- [Blocs et types de blocs](/fr/agenda/blocks/)
