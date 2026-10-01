---
title: Support
description: Comment obtenir de l'aide dans GoodWorkshop Cloud, où écrire sans pouvoir te connecter, et qui s'occupe des installations auto-hébergées.
sidebar:
  order: 5
---

L'endroit où tu obtiens de l'aide dépend de l'endroit où tourne ton GoodWorkshop : dans
[GoodWorkshop Cloud](/fr/cloud/overview/) ou sur un serveur que toi ou ton organisation gérez
vous-mêmes.

| Tu utilises …                                    | Alors …                                                                                   |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| le Cloud et tu peux te connecter                 | tu écris via le formulaire de support dans le menu du profil                              |
| le Cloud et tu n'arrives pas à entrer            | tu écris un e-mail à [support@goodworkshop.org](mailto:support@goodworkshop.org)          |
| une installation auto-hébergée                   | tu t'adresses à la personne qui la gère                                                   |
| GoodWorkshop et tu as trouvé un bug dans le code | tu le signales dans une [issue GitHub](https://github.com/roleALPHA/good-workshop/issues) |

Cette aide répond déjà à beaucoup de questions. Un coup d'œil à la
[vue d'ensemble](/fr/troubleshooting/overview/) du dépannage vaut la peine avant d'écrire.

## Dans le Cloud : le formulaire de support

:::note[Uniquement dans le Cloud]
Le formulaire de support n'existe que dans GoodWorkshop Cloud. Dans une installation auto-hébergée,
l'entrée **Support** est absente du menu du profil.
:::

1. Ouvre le menu du profil en haut à droite.
2. Choisis **Support**.
3. Saisis un **Objet** et ton **Message**.
4. Clique sur **Envoyer la demande**.

La page confirme ensuite : « Merci ! Ta demande nous est parvenue sous le ticket n° …. La réponse
arrive par e-mail. » La réponse part à l'adresse avec laquelle tu es connecté.

**Ce qui est transmis automatiquement :** ton espace de travail, ton rôle, la version de
GoodWorkshop et la langue dans laquelle tu utilises l'app. Tu n'as pas besoin de les préciser.

**Ce qui aide :** décris ce que tu as fait, ce qui s'est passé et ce que tu attendais. Si un message
d'erreur s'affiche à l'écran, copie-le mot pour mot. Si un assistant IA a reçu un message avec une
référence (« under the reference … »), joins cette référence — elle nous permet de trouver la cause
dans le journal.

### Si le formulaire ne fonctionne pas

| Message                                                                                                     | Ce que tu fais                                                                                       |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| « Le formulaire n'est pas disponible pour le moment. Écris-nous directement à support@goodworkshop.org. »   | Écris un e-mail à [support@goodworkshop.org](mailto:support@goodworkshop.org).                       |
| « Ta demande n'a pas pu être transmise pour l'instant. Écris-nous directement à support@goodworkshop.org. » | Pareil : la demande n'est pas arrivée, écris par e-mail.                                             |
| « Trop de tentatives. Réessaie plus tard. »                                                                 | Chaque personne ne peut envoyer que quelques demandes par heure. Attends un peu ou écris par e-mail. |

## Dans le Cloud, sans pouvoir te connecter

Si tu n'arrives pas à entrer dans ton compte — aucun lien de connexion n'arrive, le passkey est
refusé —, écris à [support@goodworkshop.org](mailto:support@goodworkshop.org). Indique l'adresse
e-mail de ton compte et, si tu le connais, le nom de ton espace de travail. Avant cela, un coup d'œil
à [Connexion et lien de connexion](/fr/troubleshooting/sign-in/) vaut la peine.

## Installations auto-hébergées

Une installation auto-hébergée est prise en charge par la personne qui la gère — le plus souvent le
service informatique de ton organisation ou la personne qui a mis GoodWorkshop en place. Nous
n'avons pas accès à ces installations et n'en voyons aucune donnée.

Si tu gères toi-même l'installation :

- L'aide pas à pas se trouve sous [Installation](/fr/self-hosting/installation/) et dans le README,
  sous
  [Troubleshooting](https://github.com/roleALPHA/good-workshop/blob/main/README.md#troubleshooting).
- Le journal indique la plupart des causes : `docker compose logs app` et `docker compose logs migrate`.
- Ce qui ne fonctionne volontairement pas encore est décrit dans
  [Problèmes connus](/fr/troubleshooting/known-issues/).

## Signaler un bug

Si tu as trouvé un bug dans GoodWorkshop lui-même, ouvre une
[issue sur GitHub](https://github.com/roleALPHA/good-workshop/issues). Ce qui aide :

- la version (affichée dans le pied de page de l'app et dans `/api/health`)
- ce que tu as fait, ce qui s'est passé et ce que tu attendais
- l'extrait pertinent du journal

:::caution[Pas de secrets dans les issues]
Les issues sont publiques. Retire les jetons, liens de connexion, mots de passe et données
personnelles des extraits de journal avant de les coller. Avec `GW_MAIL_TRANSPORT=console`, le
journal contient des liens de connexion valides.
:::

## Pour aller plus loin

- [Vue d'ensemble](/fr/troubleshooting/overview/)
- [Connexion et lien de connexion](/fr/troubleshooting/sign-in/)
- [GoodWorkshop Cloud](/fr/cloud/overview/)
