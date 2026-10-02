---
title: HTTPS et reverse proxy
description: HTTPS avec le profil Caddy fourni ou ton propre reverse proxy, y compris le chemin WebSocket /collab et le streaming.
sidebar:
  order: 3
---

GoodWorkshop doit être servi en HTTPS. Sans HTTPS, il n'y a **pas de passkeys**, le cookie de
session ne porte pas l'attribut `Secure` et circule en clair sur le réseau, tout comme les liens
de connexion. Tu as deux possibilités : le profil `tls` fourni ou ton propre reverse proxy.

## Le conteneur lui-même

`app` n'écoute volontairement que sur `127.0.0.1` — sans proxy devant, rien n'est joignable
depuis l'extérieur, même avec un pare-feu mal configuré. Deux services tournent dans le
conteneur :

| Service                  | Port sur `127.0.0.1` | Variable         | Pour quoi                                     |
| ------------------------ | -------------------- | ---------------- | --------------------------------------------- |
| Application              | `3000`               | `GW_PORT`        | toutes les pages, `/api/…`, `/api/mcp`        |
| Service de collaboration | `3001`               | `GW_COLLAB_PORT` | WebSocket pour l'éditeur en direct, `/collab` |

Le second port existe parce que Next ne peut pas gérer un upgrade WebSocket depuis un route
handler. Les deux proviennent de la même image.

## Option 1 : le profil `tls` (recommandé)

```bash
docker compose --profile tls up -d
```

Le profil démarre en plus un Caddy qui prend les ports 80 et 443 et obtient automatiquement un
certificat auprès de Let's Encrypt. Il te faut pour cela :

- `GW_HOSTNAME` dans le `.env` — si la valeur manque, Caddy ne démarre pas et affiche
  « GW_HOSTNAME must be set: the host name the TLS certificate is issued for. »
- un nom d'hôte qui résout publiquement vers ce serveur
- les ports 80 et 443 libres

Le `Caddyfile` fourni s'occupe en outre de :

- la compression (`encode zstd gzip`)
- l'en-tête `Strict-Transport-Security`
- les logs d'accès dans un volume dédié, supprimés au bout de 14 jours (`roll_keep_for 336h`)
- la redirection de `/collab` vers le service de collaboration et de tout le reste vers
  l'application

:::note[Le nom d'hôte dans le certificat]
Avec le Caddy fourni, ton nom d'hôte est transmis à Let's Encrypt pour l'émission du certificat
et apparaît dans les journaux publics de Certificate Transparency. Il s'agit du nom d'hôte, pas de
données d'utilisateurs.
:::

## Option 2 : ton propre reverse proxy

Si tu as déjà un proxy sur l'hôte (nginx, Traefik, un Caddy à toi), lance la stack **sans** le
profil :

```bash
docker compose up -d
```

Ton proxy doit alors faire trois choses.

### 1. `/collab` vers le port 3001, avec upgrade WebSocket

Tout ce qui se trouve sous `/collab` va au service de collaboration, et l'upgrade WebSocket doit
passer sans modification. Si `/collab` arrive à l'application sur le port 3000, celle-ci ne peut
pas le traiter.

### 2. Tout le reste vers le port 3000, sans mise en tampon

Next.js streame les composants serveur. Un proxy qui met les réponses en tampon ne livre les
pages qu'en un seul bloc. Désactive la mise en tampon pour cette route.

### 3. Transmettre la véritable adresse d'origine

L'application lit l'adresse d'origine dans `X-Forwarded-For` et compte depuis la droite autant
d'entrées que l'indique `GW_TRUSTED_PROXIES` (par défaut `1`). Si deux proxys se suivent, mets
`2`. La valeur sert uniquement à la limitation de débit et aux logs, jamais à une autorisation —
une valeur erronée te coûte la limitation de débit, pas la sécurité.

### Modèle : le Caddyfile fourni

Voici ce que contient le Caddyfile du dépôt. Les cibles y sont `app:3000` et `app:3001`, parce que
Caddy tourne dans le même réseau Compose ; un proxy installé directement sur l'hôte atteint les
mêmes services via `127.0.0.1` et les ports du tableau ci-dessus.

```
	handle /collab* {
		reverse_proxy app:3001
	}

	reverse_proxy app:3000 {
		# Next.js streams server components; buffering would make the page appear
		# only in one piece.
		flush_interval -1
	}
```

L'application définit elle-même ses en-têtes de sécurité (CSP, `frame-ancestors`, `nosniff`,
Referrer-Policy et Permissions-Policy, HSTS) ; ton proxy n'a pas à les ajouter.

### Autres chemins pour le service de collaboration

Si le service de collaboration ne se trouve pas sous `/collab` sur le même nom d'hôte, il te faut
`GW_COLLAB_URL` (l'adresse pour le navigateur) et, le cas échéant, `GW_COLLAB_INTERNAL_URL`
(l'adresse par laquelle l'application elle-même atteint le service lorsqu'une écriture MCP entre
dans une salle). Dans le cas normal, les deux restent vides.

## Sans proxy : tunnel SSH

Pour essayer, on peut aussi se passer complètement de proxy, via un tunnel :

```bash
docker compose up -d
ssh -L 3000:127.0.0.1:3000 server
```

`GW_APP_URL` doit alors pointer vers l'adresse que le navigateur utilise réellement. Sans HTTPS,
les passkeys ne fonctionnent que sur `localhost`.

## Vérifier que tout arrive bien

| Symptôme                                                                                                       | Cause                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Le certificat n'est pas émis                                                                                   | Le nom d'hôte ne résout pas vers ce serveur, ou 80/443 sont occupés                                                                                                |
| L'éditeur affiche en permanence « Pas de connexion. Tes modifications seront transmises dès qu'elle revient. » | `/collab` n'est pas redirigé, ou `GW_APP_URL` ne correspond pas à l'adresse dans le navigateur — le socket refuse une origine étrangère et l'écrit dans le journal |
| Les pages s'affichent avec du retard et seulement une fois complètes                                           | Le proxy met les réponses en tampon                                                                                                                                |
| Aucun passkey proposé                                                                                          | Pas de HTTPS                                                                                                                                                       |
| Claude ou ChatGPT ne parviennent pas à se connecter                                                            | L'installation n'est pas joignable en HTTPS depuis Internet                                                                                                        |

:::caution[Ne pas changer de nom d'hôte après coup]
Les passkeys sont liés à `GW_RP_ID`, qui, sans valeur propre, suit l'hôte de `GW_APP_URL`. Changer
le nom d'hôte après l'enregistrement de passkeys les invalide tous.
:::

## Pour aller plus loin

- [Configuration](/fr/self-hosting/configuration/)
- [Passkeys](/fr/account/passkeys/)
- [Modifier ensemble en direct](/fr/agenda/live-editing/)
- [Connecter un assistant](/fr/ai/connect/)
