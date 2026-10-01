---
title: Identité visuelle
description: Définir le logo, le nom et la couleur d'accent de l'espace de travail – et les limites qui s'appliquent.
sidebar:
  order: 4
---

Avec l'identité visuelle, GoodWorkshop prend le visage de ton organisation : un logo et une
couleur d'accent. Rien de plus, et c'est voulu. Le pied de page reste tel quel, et les
couleurs des types de blocs ne changent pas.

Ouvre le menu du compte en haut à droite et choisis, sous **Administration**, l'entrée **Identité visuelle**.

:::note
Seuls les admins modifient l'identité visuelle. Elle s'applique à tout l'espace de travail.
:::

## Téléverser un logo

1. Sous **Logo**, clique sur **Téléverser un logo** (ou **Remplacer le logo** s'il y en a déjà
   un).
2. Choisis le fichier.

Le logo apparaît dans l'en-tête. Avec **Supprimer**, tu le retires.

| Limite  | Valeur            |
| ------- | ----------------- |
| Formats | SVG, PNG ou WebP  |
| Taille  | 256 Ko au maximum |

:::tip
Un SVG reste net à toutes les tailles et est généralement le plus léger. À l'export, veille à trois
choses, sinon GoodWorkshop refuse le fichier :

- pas de scripts ni d'interactivité – beaucoup de programmes appellent cela « SVG simple »,
- pas de références externes – polices et images intégrées,
- pas de DTD ni d'entités.
  :::

Où le logo apparaît en plus dépend de l'installation : si tu héberges GoodWorkshop toi-même,
tu le vois aussi sur la page de connexion. Dans GoodWorkshop Cloud, la page de connexion n'affiche
pas de logo d'espace de travail, car avant la connexion on ne sait pas encore à quel espace de travail
la personne appartient.

## Un nom à la place d'un logo

Si tu n'as pas de logo, saisis sous **Nom (si aucun logo n'est défini)** le nom qui doit figurer dans
l'en-tête. Si un logo est défini, l'en-tête affiche le logo.

## Définir la couleur d'accent

La couleur d'accent colore les boutons et les surfaces mises en avant de l'interface.

1. Sous **Couleur d'accent**, saisis une **Valeur hexadécimale**, par exemple `#7c3aed`.
2. Appuie sur Entrée ou quitte le champ. GoodWorkshop enregistre immédiatement et affiche
   **Enregistré.**

Il n'y a pas de bouton d'enregistrement ici ; il en va de même pour le nom.

À partir de cette seule valeur de couleur, le serveur construit toutes les nuances pour le mode clair et le mode sombre.
Ce faisant, il vérifie le contraste. Une couleur qui rendrait le texte illisible est refusée, avec
l'explication :

| Message                                                         | Que faire                                                                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| « Le gris n'a pas de teinte … »                                 | Choisis un ton coloré. Le gris, le noir ou le blanc ne permettent pas de construire une couleur d'accent. |
| « En mode clair (ou sombre), cette teinte n'atteint que …:1 … » | Le contraste est inférieur à 4,5:1. Choisis un ton un peu plus foncé ou plus soutenu de la même couleur.  |
| « Indique une couleur en hexadécimal … »                        | La valeur n'est pas une valeur hexadécimale. Écris-la avec `#` et six caractères.                         |

GoodWorkshop atténue légèrement, sans demander, les couleurs très vives, pour qu'elles fonctionnent comme accent
et ne soient pas criardes. Ta saisie reste malgré tout la base.

:::note[Pourquoi les types de blocs gardent leurs couleurs]
Les couleurs des types de blocs ont un sens – une pause ressemble à une pause. Si la
couleur maison recouvrait tous les types, l'agenda ne serait plus lisible. Les couleurs
appartiennent donc au type de bloc et ne se modifient pas ici ; le rôle de chaque type est décrit
sous [Blocs et types de blocs](/fr/agenda/blocks/).
:::

## Voir aussi

- [Membres](/fr/account/members/)
- [Envoi d'e-mails](/fr/account/mail/)
- [Imprimer](/fr/sharing/print/)
