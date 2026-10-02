---
title: Comment GoodWorkshop est organisé
description: Bibliothèque, dossiers, ateliers, journées et blocs – comment les éléments s'articulent et pourquoi tu ne tapes jamais d'heure de début.
sidebar:
  order: 3
---

Une fois le modèle compris, on s'y retrouve partout. Il compte cinq niveaux, et chacun est contenu
dans celui du dessus.

```text
Bibliothèque               tout ce qui est dans ton espace de travail
└─ Dossier                 facultatif, imbrication sur autant de niveaux que tu veux
   └─ Atelier              titre, tags, blocs mis de côté, accès
      └─ Journée           nom, date, début, note sur la journée
         ├─ Bloc           type, titre, durée, description …
         ├─ Section        regroupe des blocs qui se suivent
         │  └─ Bloc
         └─ Breakout       volets qui se déroulent en même temps
            └─ Volet
               └─ Bloc
```

## Les niveaux

| Niveau           | Ce que c'est                                                                                                                                                             | Où tu le modifies                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| **Bibliothèque** | Tous les ateliers que tu as le droit de voir. Les admins voient tous ceux de l'espace de travail.                                                                        | [Dossiers et ateliers](/fr/library/folders-and-workshops/) |
| **Dossier**      | Pour trier, pas pour posséder : les dossiers appartiennent à l'espace de travail, pas à une personne. Tu vois ceux auxquels tu as accès. Un atelier est dans un au plus. | Colonne **Dossiers** dans la bibliothèque                  |
| **Atelier**      | Ce que tu planifies. Il appartient à la personne qui l'a créé, porte des tags et a sa zone de blocs mis de côté.                                                         | En-tête de la page de l'atelier                            |
| **Journée**      | Une journée d'atelier avec son propre début, sa propre date et son propre agenda. Un atelier en a toujours au moins une.                                                 | [Journées](/fr/agenda/days/)                               |
| **Bloc**         | Un point du programme : check-in, apport, travail en groupe, pause. Le type détermine la couleur, la durée habituelle et les champs supplémentaires.                     | [Blocs et types de blocs](/fr/agenda/blocks/)              |

:::caution[« Tag » ne veut pas dire « journée »]
Dans GoodWorkshop, un **tag** est un mot-clé attaché à l'atelier (le champ **+ tag** sous le
titre), jamais une journée d'atelier. Dans l'interface allemande, « Tag » désigne les deux – c'est
pourquoi les boutons des journées s'appellent **Journée** et **Supprimer la journée d'atelier**.
Pour en savoir plus sur les mots-clés : [Mots-clés](/fr/library/tags/).
:::

## Sections et breakouts

Une **section** regroupe sous un même titre des blocs qui se déroulent l'un après l'autre – par
exemple « Arrivée et cadre » avec check-in, agenda et énergiseur. La ligne de la section indique
combien de blocs elle contient et combien de temps ils durent ensemble.

Un **breakout** est une section dont les **volets** se déroulent en même temps : des petits groupes
parallèles dans des salles différentes, chacun avec son propre petit déroulé. Tous les volets
commencent quand le breakout commence, et le breakout se termine quand le volet le plus long se
termine. Les blocs sont toujours rattachés à un volet, jamais directement au breakout. Un breakout
dans un breakout n'existe pas. Détails dans [Sections et breakouts](/fr/agenda/clusters-and-breakouts/).

## Les blocs mis de côté appartiennent à l'atelier

Un bloc que tu mets de côté avec **Mettre de côté** disparaît du déroulé, mais garde sa
description, son matériel et ses notes. Il ne compte plus dans le temps et apparaît sous l'agenda,
dans **De côté**. Comme cette zone appartient à tout l'atelier, tu peux reprendre le deuxième jour,
avec **Remettre dans le déroulé**, un exercice qui n'avait pas trouvé de place le premier jour. Même
si tu supprimes une journée, ses blocs mis de côté sont conservés. Pour en savoir plus :
[Mettre de côté](/fr/agenda/parking/).

## Les heures de début sont calculées

Tu ne tapes jamais l'heure de début d'un bloc. GoodWorkshop la calcule :

> début de la journée + durée de tous les blocs précédents = heure de début du bloc

Si une durée ou l'ordre change, toutes les heures suivantes se décalent. L'en-tête de la journée
affiche le début et la fin, la part de contenu et de pause, et le nombre de blocs de la journée.

La seule exception est une **heure de début fixée** : un bloc que tu cloues à une heure précise y
reste. Si le bloc précédent se termine plus tôt, il se crée un trou, affiché comme **Marge**. S'il
se termine plus tard, la ligne indique par exemple « Chevauche le bloc précédent de 20m » –
GoodWorkshop ne raccourcit rien en douce. Pour en savoir plus :
[Durées et heures de début](/fr/agenda/timing/).

## Pour continuer

- [Planifier ton premier atelier](/fr/start/quickstart/)
- [S'y retrouver](/fr/start/finding-your-way/)
- [Durée et heures de début](/fr/agenda/timing/)
