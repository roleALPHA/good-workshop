---
title: Planifier avec l'assistant IA
description: Ce qu'est MCP, ce qu'un assistant IA connecté comme Claude ou ChatGPT peut faire dans GoodWorkshop – et ce qu'il ne peut délibérément pas faire.
sidebar:
  order: 1
---

GoodWorkshop intègre un **serveur MCP**. Il te permet de connecter un assistant IA comme Claude, ChatGPT ou Gemini à tes ateliers et de lui demander de concevoir, de remanier ou de résumer un agenda. Ce qu'il écrit arrive directement dans ta bibliothèque – pas de copier-coller, pas de ressaisie.

## Qu'est-ce que MCP ?

MCP (Model Context Protocol) est un standard ouvert qui permet aux assistants IA de travailler avec d'autres programmes. Un programme propose des **outils** à l'assistant – dans GoodWorkshop par exemple « créer un atelier », « lire une journée » ou « écrire tout un agenda ». L'assistant décide, d'après ta demande, quels outils il appelle.

Tu connectes l'assistant une seule fois à l'adresse de ton installation, par exemple `https://goodworkshop.org/api/mcp` dans GoodWorkshop Cloud. La marche à suivre est décrite dans [Connecter un assistant](/fr/ai/connect/).

## Ce que l'assistant peut faire

Un assistant connecté peut faire ce que tu peux faire toi-même dans la bibliothèque et dans l'éditeur de journée :

| Domaine                | Exemples                                                                                           |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| Bibliothèque           | créer des dossiers, créer des ateliers, les renommer, les ranger dans des dossiers, poser des tags |
| Corbeille              | mettre des ateliers à la corbeille, les restaurer, les supprimer définitivement                    |
| Journées               | créer des journées, les réordonner, les supprimer ; modifier le nom, la date, le début et la note  |
| Agenda                 | écrire toute une journée d'un seul coup, avec sections et breakouts                                |
| Blocs                  | modifier, déplacer, mettre de côté, supprimer un ou plusieurs blocs ; indiquer les responsables    |
| Lecture                | lire une journée avec tous ses horaires, récupérer tout l'atelier en Markdown                      |
| Découvrir des méthodes | chercher dans la collection de méthodes et reprendre des entrées (Cloud uniquement)                |

La liste complète avec tous les paramètres se trouve dans la [référence des outils](/fr/ai/tools/), des idées de demandes dans [Exemples](/fr/ai/examples/).

Sur quelques points, l'assistant fonctionne comme GoodWorkshop lui-même :

- **GoodWorkshop calcule les heures de début** à partir du début de la journée et des durées. L'assistant ne les fixe pas, mais il peut caler un bloc sur une heure fixe – voir [Durée et heures de début](/fr/agenda/timing/).
- **Il écrit des agendas entiers en un seul appel.** C'est tout ou rien : si un bloc ne convient pas, rien n'est écrit, et l'assistant apprend ce qu'il doit corriger.
- **Il écrit en direct.** Si tu as la journée ouverte, tu vois ses modifications immédiatement, et il apparaît comme **Assistant IA** lors de la [modification à plusieurs](/fr/agenda/live-editing/). Pour ne rien écraser de ce que tu viens de modifier, il peut joindre à chaque modification la version qu'il a lue en dernier. Si l'atelier a changé entre-temps, GoodWorkshop refuse la modification, et l'assistant doit relire.

## Ce que l'assistant ne peut pas faire

:::caution[Délibérément exclu]
Via MCP, il n'existe **aucun** outil pour :

- **les membres** – inviter, retirer ou nommer admin qui que ce soit,
- **les partages** – [partager avec des personnes](/fr/sharing/share-with-people/) un atelier ou un dossier,
- **les liens d'invitation** – [convier des invités](/fr/sharing/share-links/) ou retirer des liens,
- **les jetons** – créer ou révoquer des clés d'accès.

Donner à d'autres l'accès à tes données est une étape que tu fais toi-même dans l'application – aucun modèle ne doit pouvoir le faire en ton nom.
:::

Par ailleurs :

- **L'assistant agit en tant que toi.** Il ne peut jamais faire plus que ce que tu as le droit de faire. Un atelier que tu peux seulement lire, il ne peut pas le modifier ; il ne peut déplacer ou supprimer des dossiers que si tu es admin de l'espace de travail. Il ne voit aussi que les ateliers que tu vois dans ta bibliothèque.
- **Ce qu'il a le droit de faire, tu le fixes lors de la connexion** – par les périmètres que tu autorises (par exemple lecture seule ou aussi écriture). Voir [Connecter un assistant](/fr/ai/connect/).
- **Il ne modifie pas les types de blocs.** Il les lit pour savoir quels champs un bloc possède.
- **Il ne voit pas la liste des membres.** Il désigne les responsables par leur nom complet ; si un nom ne correspond à personne dans l'espace de travail, la personne est inscrite comme externe – voir [Responsables](/fr/agenda/responsible/).

:::note[Suppression définitive]
L'assistant ne peut supprimer définitivement qu'un atelier qui se trouve déjà dans la [corbeille](/fr/library/trash/), et il a pour consigne de ne le faire que sur ta demande expresse. Formule-le clairement si c'est ce que tu veux – et pas du tout si ce n'est pas le cas.
:::

## Où se trouve la connexion

Dans GoodWorkshop, tout ce qui concerne la connexion se trouve dans le menu du profil en haut à droite, sous **Connexion IA** : l'URL du serveur, des instructions pour chaque client et tes jetons personnels.

## Voir aussi

- [Connecter un assistant](/fr/ai/connect/)
- [Référence des outils](/fr/ai/tools/)
- [Exemples](/fr/ai/examples/)
- [Connexion IA – Dépannage](/fr/troubleshooting/ai-connection/)
