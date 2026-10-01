---
title: Durée et heures de début
description: Comment GoodWorkshop calcule les heures de début et de fin à partir du début de la journée et des durées, comment fixer une heure et ce qui se passe en cas de chevauchement.
sidebar:
  order: 3
---

Dans GoodWorkshop, tu ne saisis pas d'heures de début. Tu donnes un début à la journée et une durée à chaque bloc, et les heures en découlent : le premier bloc commence avec la journée, chaque bloc suivant quand le précédent se termine. Si tu déplaces un bloc, modifies une durée ou mets quelque chose de côté, toutes les heures sont aussitôt à jour.

## Définir le début de la journée

Sous les onglets des journées se trouve le champ **Début de la journée**. Modifie l'heure à cet endroit, et tous les blocs suivent, sauf ceux que tu as fixés. Une nouvelle journée reprend le début de la dernière journée existante, voir [Journées](/fr/agenda/days/).

## Modifier une durée

La durée est affichée en gras sous l'heure de début. Clique dedans et tapes-en une nouvelle. Le champ comprend de nombreuses écritures :

| Tu tapes                         | Résultat                      |
| -------------------------------- | ----------------------------- |
| `45`, `45m`, `45 min`, `45 min.` | 45 minutes                    |
| `1h30`, `1h 30m`, `1:30`         | 1 heure 30 minutes            |
| `1,5h`, `1.5h`, `1 h`            | 1 heure 30 minutes ou 1 heure |

Pour l'instant, le champ ne reconnaît pas les mots français comme « minutes » ou « heure » : utilise les abréviations `h` et `min`.

Entrée ou un clic à côté valide la valeur, Échap l'annule. Ce que le champ ne peut pas lire sans ambiguïté n'est pas deviné : il revient à l'ancienne valeur, et un cadre rouge t'avertit dès la saisie. Une durée est comprise entre 0 minute et 24 heures.

:::tip[Avec les flèches]
Dans le champ de durée, la flèche haut allonge de 5 minutes, la flèche bas raccourcit de 5. En maintenant la touche Maj, c'est 15 minutes. La valeur est prise en compte immédiatement.
:::

Les sections et les breakouts n'ont pas de durée propre. La leur découle des blocs qu'ils contiennent, voir [Sections et breakouts](/fr/agenda/clusters-and-breakouts/).

## Fixer une heure de début

Parfois, une heure est imposée : le déjeuner est à 12:30, la direction arrive à 14:00. Tu fixes alors le bloc à cette heure.

1. Passe la souris sur le bloc ou clique dedans. Un cadenas ouvert apparaît à côté de l'heure de début. Sur un écran tactile, il est toujours visible.
2. Clique sur le cadenas (**Fixer l’heure de début**). Le bloc reprend l'heure à laquelle il commence actuellement. Dans un premier temps, rien ne change donc dans le déroulé.
3. Saisis l'heure souhaitée dans le champ **Heure de début fixée**.

Un bloc fixé affiche un cadenas fermé. Il garde son heure, quoi qu'il se passe avant lui. Les blocs suivants sont calculés à partir de sa fin. Avec **Libérer l’heure fixée**, un nouveau clic sur le cadenas, il est de nouveau calculé normalement.

Tu peux aussi fixer ainsi une section ou un breakout ; son cadenas se trouve dans l'en-tête, et n'y est pas affiché sur le téléphone. Les volets d'un breakout commencent toujours en même temps que le breakout.

## Écarts et chevauchements

Comme un bloc fixé ne cède pas, le déroulé qui le précède ne tombe pas toujours juste.

- **Écart :** si le bloc précédent se termine plus tôt, une ligne pointillée avec **Marge** apparaît avant le bloc fixé, par exemple « 15m Marge ». C'est seulement un affichage, pas un bloc.
- **Chevauchement :** si le bloc précédent se termine plus tard, un avertissement apparaît sur le bloc fixé : **Chevauche le bloc précédent de 10m**. Les deux blocs se déroulent alors, en théorie, en même temps.

:::note
GoodWorkshop ne résout jamais un chevauchement de lui-même : il ne raccourcit rien et ne déplace rien. C'est voulu : souvent, ce n'est qu'un état intermédiaire, le temps que tu raccourcisses un bloc précédent. L'avertissement reste jusqu'à ce que les heures concordent à nouveau.
:::

## Fin de la journée

Sous le dernier bloc figure l'heure à laquelle la journée se termine, avec le mot **Fin**. Tu retrouves la même heure en haut, dans le résumé, avec le **contenu**, les **pauses** et le nombre de blocs. Les pauses sont les durées des types **Pause**, **Déjeuner**, **Marge** et **Note** ; tout le reste compte comme contenu. Les blocs mis de côté ne comptent pas du tout.

Si une journée passe minuit, un `(+1)` suit l'heure, par exemple `01:30 (+1)`. Une heure fixée antérieure au début de la journée est donc considérée comme une heure du lendemain : un bloc que tu fixes à 01:00 pour une journée qui commence à 20:00 s'affiche à `01:00 (+1)`.

## Pages associées

- [Journées](/fr/agenda/days/)
- [Blocs et types de blocs](/fr/agenda/blocks/)
- [Sections et breakouts](/fr/agenda/clusters-and-breakouts/)
- [Blocs mis de côté](/fr/agenda/parking/)
