---
title: Exporter en Markdown
description: Télécharger une journée ou tout l'atelier sous forme de fichier Markdown – à coller dans un wiki, des notes, un e-mail ou à transmettre.
sidebar:
  order: 4
---

Chaque agenda peut être téléchargé à tout moment sous forme de fichier Markdown. Le Markdown est du texte brut avec quelques caractères pour les titres et les tableaux. Tu peux le coller dans un wiki, un outil de prise de notes, un ticket ou un e-mail, et un tableau y reste un tableau.

## Exporter en trois étapes

1. Ouvre une journée de l'atelier.
2. En haut à droite, choisis avec les deux cases ce qui est inclus :
   - **Tout l'atelier** – toutes les journées dans un seul fichier au lieu de la seule journée ouverte.
   - **Avec les notes d'animation** – tes notes sur les blocs.
3. Clique sur **Markdown**. Ton navigateur télécharge un fichier `.md` portant le nom de l'atelier.

Les deux cases valent aussi pour [Imprimer](/fr/sharing/print/) – elles répondent à la même question : pour qui est cette copie ?

:::caution[Les notes sont exclues par défaut]
Les champs qu'un type de bloc marque comme privés – aujourd'hui les notes d'animation – ne figurent dans le fichier qu'avec **Avec les notes d'animation**. La case est décochée à chaque ouverture. Ne transmets pas un fichier contenant des notes aux participants.
:::

## Ce que contient le fichier

**Au début, un en-tête** avec des informations pour les outils qui lisent les métadonnées Markdown : titre, date (pour plusieurs journées, une liste des dates) et durée totale. Pour tout l'atelier s'ajoutent le chemin du dossier, les [tags](/fr/library/tags/) et le nombre de journées.

**Puis le titre** de l'atelier comme titre principal. Pour tout l'atelier, chaque journée suit sous son propre titre : son nom, à défaut sa date, à défaut « Journée 1 », « Journée 2 » …

**Pour chaque journée, un résumé** : nom, date, début et fin ainsi que la répartition, par exemple « 5h 30m de contenu, 1h 15m de pauses ».

**En dessous, le déroulé sous forme de tableau** avec les colonnes Heure, Durée, Bloc et Info :

| Colonne | Contenu                                                                                   |
| ------- | ----------------------------------------------------------------------------------------- |
| Heure   | Heure de début ; 🔒 pour une [heure de début fixée](/fr/agenda/timing/)                   |
| Durée   | Durée du bloc ou de la section                                                            |
| Bloc    | Titre ; [sections](/fr/agenda/clusters-and-breakouts/) en gras, entrées en retrait avec ↳ |
| Info    | Responsable, type de bloc, le cas échéant « ⚠ Chevauchement »                             |

Pour un breakout, la colonne Info indique le nombre de volets avec la mention « en parallèle », et pour chaque volet « Volet 1 sur 3 ». On comprend ainsi pourquoi la même heure apparaît plusieurs fois.

**Pour finir, une section « Détails »** avec la description et les autres champs de chaque bloc – matériel, format et tout ce que le type de bloc apporte d'autre –, chacun avec son libellé dans l'app.

Tout en bas figure une ligne mentionnant GoodWorkshop.

:::note[Ce qui n'est pas exporté]
Les blocs [mis de côté](/fr/agenda/parking/) ne figurent pas dans le planning, et donc pas non plus dans le fichier.
:::

## Une journée ou tout l'atelier

| Choix                   | Résultat                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sans **Tout l'atelier** | Un fichier avec la journée ouverte.                                                                                                                                                                           |
| avec **Tout l'atelier** | Un fichier avec toutes les journées dans leur ordre – pas d'archive avec des fichiers séparés. Un atelier sans journée donne un fichier avec le titre et la phrase « Cet atelier n'a pas encore de journée. » |

## Langue du fichier

Le fichier est rédigé dans la langue que tu as réglée dans ton [profil](/fr/account/profile-and-language/) : noms de colonnes, types de blocs et libellés des champs. Tes propres textes – titres, descriptions – restent tels que tu les as écrits.

:::tip[Exporter pour une autre langue]
Si tu as besoin de l'agenda pour des participants dans une autre langue, ajoute `?locale=en` à l'adresse du téléchargement (ou `fr`, `es`, `de`) ; s'il y a déjà un `?`, alors `&locale=en`. Tu n'as pas besoin de changer ton profil pour cela.
:::

## Qui peut exporter

Tout membre qui peut voir l'atelier peut exporter – avec **Lire**, **Modifier** ou en tant que propriétaire. Les invités via un [lien d'invitation](/fr/sharing/share-links/) ne peuvent pas exporter.

L'export fonctionne aussi lorsque ton espace de travail est en lecture seule ou bloqué à cause d'un paiement en attente. Tes contenus sortent toujours.

:::tip[Export via l'assistant IA]
Un [assistant IA connecté](/fr/ai/introduction/) récupère le même texte avec l'outil `export_workshop` – pratique quand il doit résumer l'atelier, le traduire ou le mettre en forme dans un e-mail. Voir [Exemples](/fr/ai/examples/).
:::

## Voir aussi

- [Imprimer](/fr/sharing/print/) – le même déroulé sur papier ou en PDF
- [Sections et breakouts](/fr/agenda/clusters-and-breakouts/)
- [Responsables](/fr/agenda/responsible/)
- [Référence des outils](/fr/ai/tools/)
