---
title: Vue d'ensemble
description: Du symptôme à la bonne page d'aide — pour la connexion, la connexion IA, l'éditeur en direct et l'auto-hébergement.
sidebar:
  order: 1
---

Cherche ton symptôme dans les tableaux et va directement à la bonne page. Beaucoup de messages de
GoodWorkshop sont des phrases entières ; les pages d'aide les citent mot pour mot pour que la
recherche en haut les trouve. Copie simplement le texte que tu vois dans la recherche.

## Se connecter

| Symptôme                                                                                | Page                                                           |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Aucun e-mail n'arrive après **Envoyer un lien de connexion**                            | [Connexion et lien de connexion](/fr/troubleshooting/sign-in/) |
| « Ce lien a expiré ou a déjà été utilisé. Demandes-en un nouveau. »                     | [Connexion et lien de connexion](/fr/troubleshooting/sign-in/) |
| « Le lien était incomplet. Demandes-en un nouveau. »                                    | [Connexion et lien de connexion](/fr/troubleshooting/sign-in/) |
| Pas de bouton **Se connecter avec un passkey**, mais « Les passkeys demandent HTTPS … » | [Connexion et lien de connexion](/fr/troubleshooting/sign-in/) |
| « Le passkey n'a pas pu être confirmé. »                                                | [Connexion et lien de connexion](/fr/troubleshooting/sign-in/) |
| « Cette invitation n'est plus valable »                                                 | [Connexion et lien de connexion](/fr/troubleshooting/sign-in/) |
| « Connecte-toi, s'il te plaît. » en plein travail                                       | [Connexion et lien de connexion](/fr/troubleshooting/sign-in/) |

## Assistant IA

| Symptôme                                                               | Page                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------------- |
| Claude ou ChatGPT n'atteignent pas le serveur                          | [Connexion IA](/fr/troubleshooting/ai-connection/)    |
| HTTP 401 avec `invalid_token`                                          | [Connexion IA](/fr/troubleshooting/ai-connection/)    |
| HTTP 429 avec `rate_limited`                                           | [Connexion IA](/fr/troubleshooting/ai-connection/)    |
| Erreur sur la page **Autoriser l'accès ?**                             | [Connexion IA](/fr/troubleshooting/ai-connection/)    |
| `This token does not have the "…" scope.`                              | [Connexion IA](/fr/troubleshooting/ai-connection/)    |
| `The call failed. The operator can find the cause in the server log …` | [Connexion IA](/fr/troubleshooting/ai-connection/)    |
| Révoquer un accès OAuth                                                | [Problèmes connus](/fr/troubleshooting/known-issues/) |

## Travailler dans l'agenda

| Symptôme                                                                       | Page                                                                                                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| « Pas de connexion. Tes modifications seront transmises dès qu'elle revient. » | [Modifier ensemble en direct](/fr/agenda/live-editing/) ; en auto-hébergement : [HTTPS et reverse proxy](/fr/self-hosting/tls/) |
| « Quelqu'un d'autre a modifié cet atelier entre-temps. »                       | [Modifier ensemble en direct](/fr/agenda/live-editing/)                                                                         |
| « Contient de la mise en forme. L'édition arrivera avec l'éditeur de texte … » | [Problèmes connus](/fr/troubleshooting/known-issues/)                                                                           |
| « Cet espace de travail est en lecture seule. » (Cloud)                        | [Tarifs et facturation](/fr/cloud/pricing-and-billing/)                                                                         |

## Auto-hébergement

| Symptôme                                                                                | Page                                                                                                                           |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `GW_APP_URL must be set` au démarrage                                                   | [Installation](/fr/self-hosting/installation/)                                                                                 |
| Caddy ne démarre pas, « GW_HOSTNAME must be set … »                                     | [HTTPS et reverse proxy](/fr/self-hosting/tls/)                                                                                |
| Le certificat n'est pas délivré                                                         | [HTTPS et reverse proxy](/fr/self-hosting/tls/)                                                                                |
| Pas de clé d'installation dans le journal, ou « La clé d'installation est incorrecte. » | [Connexion et lien de connexion](/fr/troubleshooting/sign-in/)                                                                 |
| `/api/health` répond 503 avec `database`                                                | La base de données n'est pas joignable ou démarre encore — attends un peu, voir [Installation](/fr/self-hosting/installation/) |
| `/api/health` répond 503 avec `migrations`                                              | [Mettre à jour et sauvegarder](/fr/self-hosting/upgrade/)                                                                      |
| `migrate` s'arrête avec « MIGRATION STOPPED »                                           | [Mettre à jour et sauvegarder](/fr/self-hosting/upgrade/)                                                                      |
| Graph répond `403` ou `invalid_client`                                                  | [Connexion et lien de connexion](/fr/troubleshooting/sign-in/)                                                                 |
| Restauration d'une sauvegarde, les identifiants de messagerie sont vides                | [Mettre à jour et sauvegarder](/fr/self-hosting/upgrade/)                                                                      |
| L'interface est dans la mauvaise langue                                                 | [Profil et langue](/fr/account/profile-and-language/)                                                                          |

:::tip[Regarde d'abord le journal]
Sur une installation auto-hébergée, le journal indique presque toujours la cause :
`docker compose logs app` pour l'application, `docker compose logs migrate` pour le démarrage et la
mise à jour.
:::

## Rien ne correspond ?

- Ce qui ne fonctionne volontairement pas encore est décrit dans
  [Problèmes connus](/fr/troubleshooting/known-issues/).
- Comment nous joindre, ou joindre la personne qui gère ton installation, est expliqué dans
  [Support](/fr/troubleshooting/support/).
