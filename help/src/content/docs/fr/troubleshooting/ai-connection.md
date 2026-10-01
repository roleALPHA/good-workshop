---
title: Connexion IA
description: Quand Claude, ChatGPT ou un autre client MCP ne se connecte pas, renvoie 401 ou 429, ou qu'un outil s'arrête avec un message d'erreur.
sidebar:
  order: 3
---

Un assistant IA se connecte à GoodWorkshop via MCP, soit avec un jeton, soit par OAuth. Tu
configures les deux sous **Connexion IA** dans le menu du profil, voir
[Connecter un assistant](/fr/ai/connect/). L'URL du serveur est toujours l'adresse de ton
installation suivie de `/api/mcp` ; la page **Connexion IA** l'affiche pour que tu puisses la copier.

Les messages d'erreur des outils sont en **anglais**, car ils s'adressent au modèle, pas à toi. Les
textes ci-dessous sont donc cités dans leur version d'origine.

## Le client ne se connecte pas du tout

| Ce que tu vois                                                   | Cause et solution                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude (web, bureau, app) ou ChatGPT n'atteignent pas le serveur | Ces clients se connectent depuis le cloud de leur éditeur. Cela ne fonctionne que si l'URL du serveur est accessible depuis Internet en HTTPS. Une installation dans un réseau d'entreprise n'est accessible qu'aux clients qui tournent sur ton ordinateur, comme Claude Code ou Gemini CLI. |
| L'URL du serveur affichée est fausse (auto-hébergement)          | L'URL est construite à partir de `GW_APP_URL`. Corrige la valeur, voir [Configuration](/fr/self-hosting/configuration/).                                                                                                                                                                      |
| `method_not_allowed`                                             | Le client interroge le serveur en GET. GoodWorkshop n'accepte MCP qu'en POST (« Streamable HTTP ») et n'envoie rien de lui-même. Choisis le transport HTTP dans le client ; avec Claude Code et Gemini CLI, `--transport http`.                                                               |

## HTTP 401 : `invalid_token`

Le serveur n'a pas accepté le jeton. Raisons possibles :

- **Le jeton a été révoqué**, ou n'a jamais été copié en entier. Un jeton n'est affiché en clair
  qu'une seule fois, juste après **Créer un jeton**. S'il est perdu, crées-en un nouveau.
- **« Bearer » en double ou absent.** L'en-tête s'écrit `Authorization: Bearer gwp_…`. Langdock
  ajoute lui-même le mot « Bearer » — là, tu colles uniquement le jeton nu.
- **Codex : la variable d'environnement manque.** L'entrée ne donne que le nom `GW_TOKEN`. Si
  `export GW_TOKEN=…` ne figure pas dans la configuration de ton shell, Codex ne connaît le jeton
  que dans ce seul terminal.
- **Claude Desktop : espace dans l'en-tête.** Claude Desktop découpe `args` aux espaces.
  `"Authorization: Bearer …"` devient deux arguments, et l'en-tête disparaît sans message. Reprends
  la configuration exactement telle que la page **Connexion IA** l'affiche : le jeton dans `env`,
  et dans l'argument `Authorization:${GW_TOKEN}` sans espace.
- **Un accès OAuth a expiré ou a été déconnecté.** Reconnecte le client.
- **Le compte n'est plus membre** ou a été désactivé. Les jetons disparaissent avec l'adhésion.

## Problèmes avec OAuth et la page d'autorisation

Avec OAuth, tu te connectes à GoodWorkshop dans le navigateur et tu confirmes sur la page
**Autoriser l'accès ?** ce que le client a le droit de faire.

:::tip[Connecte-toi d'abord, puis connecte le client]
Connecte-toi d'abord à GoodWorkshop dans ce navigateur. Sinon, après la connexion, tu arrives dans
la bibliothèque et tu dois relancer la connexion depuis le client.
:::

Si la demande échoue, la page d'autorisation affiche la raison au lieu d'un bouton :

| Message                                                                | Signification                                                                           |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| « Cette installation ne connaît pas ce client. »                       | Le client ne s'est pas enregistré, ou s'est enregistré auprès d'une autre installation. |
| « Cette adresse de retour n'appartient pas à ce client. »              | L'adresse de retour doit correspondre exactement à une adresse enregistrée.             |
| « Cette requête nomme un type de réponse que ce serveur n'offre pas. » | Le client demande autre chose qu'un code d'autorisation.                                |
| « Cette requête arrive sans PKCE valide. Ce serveur en exige un. »     | Le serveur exige PKCE avec S256.                                                        |
| « Cet accès a été demandé pour un autre serveur. »                     | Le client a demandé un jeton pour une autre URL de serveur.                             |

Dans tous les cas : « Rien n'a été accordé. Recommence depuis le client — si cela échoue encore, le
défaut est dans sa configuration. »

## HTTP 429 : `rate_limited`

`/api/mcp` accepte au maximum **60 requêtes par minute** par adresse d'origine. Un assistant qui
appelle de très nombreux outils à la suite peut atteindre cette limite. Attends une minute.

En auto-hébergement : si beaucoup d'utilisateurs atteignent la limite en même temps, la vraie
adresse d'origine n'arrive probablement pas jusqu'au serveur — tous partagent alors le même
compteur. Vérifie que ton proxy définit `X-Forwarded-For` et que `GW_TRUSTED_PROXIES` correspond au
nombre de proxys, voir [HTTPS et reverse proxy](/fr/self-hosting/tls/).

## Un outil s'arrête avec un message

| Message de l'outil                                                                                                                        | Signification et solution                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `This token does not have the "workshops:write" scope. Create a token with that scope in the settings.`                                   | Il manque un droit au jeton (ici **Écrire les ateliers**). Les droits ne peuvent pas être modifiés après coup : crée un nouveau jeton avec les droits nécessaires.                          |
| `You do not have permission for that: …`                                                                                                  | Le jeton agit en ton nom et ne peut jamais faire plus que toi — tu n'as pas les droits sur cet atelier.                                                                                     |
| `The workshop has changed in the meantime (expected …, found …).`                                                                         | Quelqu'un d'autre a modifié l'atelier entre-temps. L'assistant doit le relire et réessayer.                                                                                                 |
| `The collaboration service is unreachable. Nothing can be written without it, because that would mean two write paths onto the same day.` | L'écriture passe uniquement par le service de collaboration. En auto-hébergement : vérifie qu'il tourne et qu'il est joignable (`GW_COLLAB_INTERNAL_URL`).                                  |
| `The call failed. The operator can find the cause in the server log under the reference …`                                                | Une erreur interne. La personne qui gère l'installation trouve la cause sous cette référence dans le journal. Dans le Cloud, donne la référence au [Support](/fr/troubleshooting/support/). |

:::note[Ce qu'un assistant ne peut jamais faire]
Ni un jeton ni un accès OAuth ne peut inviter des membres, nommer des admins ou gérer les partages.
C'est voulu et ne peut pas être débloqué.
:::

## Mettre fin à un accès

Tu révoques un jeton sous **Connexion IA** avec **Révoquer**. Pour mettre fin à un accès OAuth, tu
déconnectes le connecteur dans le client — GoodWorkshop ne permet pas encore de le révoquer
lui-même, voir [Problèmes connus](/fr/troubleshooting/known-issues/).

## Pour aller plus loin

- [Connecter un assistant](/fr/ai/connect/)
- [Référence des outils](/fr/ai/tools/)
- [Vue d'ensemble](/fr/troubleshooting/overview/)
