---
title: Installation
description: Installer GoodWorkshop sur ton propre serveur avec Docker Compose et créer le premier compte admin via /setup.
sidebar:
  order: 1
---

L'édition Community de GoodWorkshop tourne sous la forme d'une image de conteneur plus Postgres,
lancées avec Docker Compose. Aucune licence n'est due pour planifier et animer tes ateliers, pas
même en usage commercial. Si tu ne veux pas exploiter de serveur : la
[GoodWorkshop Cloud](/fr/cloud/overview/) est le même produit, hébergé.

Cette page résume l'installation. La référence est la section
[Installation (on-premise)](https://github.com/roleALPHA/good-workshop/blob/main/README.md#installation-on-premise)
du README.

## Prérequis

| Quoi            | Exigence                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------ |
| Docker          | Docker avec Compose v2 (`docker compose version`), amd64 ou arm64                          |
| Nom d'hôte      | Un nom qui résout publiquement vers ce serveur                                             |
| Ports           | 80 et 443 libres — Let's Encrypt a besoin des deux pour le certificat                      |
| Base de données | Rien à faire : Postgres tourne dans la stack et n'est pas joignable depuis l'extérieur     |
| Mots de passe   | Rien à faire : la stack génère elle-même les mots de passe de la base au premier démarrage |

## 1. Récupérer les fichiers

Il te faut `compose.yaml`, `Caddyfile` et un `.env` :

```bash
git clone https://github.com/roleALPHA/good-workshop.git
cd good-workshop
cp .env.example .env
```

## 2. Choisir l'image

Les releases se trouvent dans le GitHub Container Registry. `compose.yaml` récupère l'image
indiquée par `GW_VERSION`. `latest` pointe toujours vers la release stable la plus récente.
Chaque release existe aussi sous son propre numéro — tu restes ainsi sur une version jusqu'à ce
que tu mettes à jour toi-même. Tu n'as rien à compiler.

:::caution[Sans « v »]
Le tag de l'image n'a pas de « v » : la release `v0.8.22` s'appelle `0.8.22` comme image. Avec le
« v », le téléchargement échoue avec « not found ».
:::

## 3. Remplir le `.env`

Trois valeurs sont obligatoires. S'il en manque une, la stack ne démarre pas et nomme la valeur
manquante :

```bash
GW_APP_URL=https://workshop.example.com   # the address the app is reachable at
GW_HOSTNAME=workshop.example.com          # the name in the certificate (profile `tls`)
GW_VERSION=latest                         # the newest stable release, or e.g. 0.8.22 to pin one
```

**L'e-mail peut attendre.** Pour le premier démarrage, tu n'as pas besoin d'envoi d'e-mails : la
page de configuration affiche elle-même ton lien de connexion. Ensuite, tu configures l'envoi dans
l'interface sous **Envoi d'e-mails**, voir [Envoi d'e-mails](/fr/account/mail/). Toutes les autres
variables figurent sous [Configuration](/fr/self-hosting/configuration/).

:::danger[Fixer le nom d'hôte maintenant]
Les passkeys sont liés au nom d'hôte. Le changer plus tard invalide **chaque** passkey déjà
enregistré. Décide du nom avant le premier démarrage.
:::

## 4. Démarrer

```bash
docker compose --profile tls up -d
```

Voici ce qui se passe, dans l'ordre :

1. `secrets` génère les mots de passe de la base, un par rôle.
2. `db` démarre.
3. `migrate` crée les rôles, vérifie les données existantes, applique les migrations et installe
   les types de blocs.
4. `app` ne démarre qu'une fois que `migrate` s'est terminé proprement.
5. `caddy` prend les ports 80 et 443 et obtient le certificat.

Si tout fonctionne, le healthcheck répond :

```bash
curl -fsS https://workshop.example.com/api/health
# {"status":"ok","checks":[{"name":"database","ok":true},{"name":"migrations","ok":true}]}
```

Un `503` n'est pas un plantage, mais la réponse honnête « ce conteneur ne peut pas servir ».
`checks` indique si cela tient à la base de données ou à l'état des migrations.

## 5. Prendre possession de l'installation dans le navigateur

Une installation neuve se signale dans le journal à chaque démarrage, jusqu'à ce que quelqu'un en
prenne possession :

```bash
docker compose logs app
```

```
  This installation has no administrator yet.

    https://workshop.example.com/setup
    Setup key: 7Qb3…

  The key is valid until this process restarts.
```

1. Ouvre l'adresse `/setup` affichée.
2. Saisis **Prénom**, **Nom** et **Ton adresse e-mail**.
3. Colle la **Clé d'installation** tirée du journal.
4. Clique sur **Configurer cette installation**.

Si aucun envoi d'e-mails n'est encore configuré, le lien de connexion s'affiche directement sur la
page. Il ne sert qu'une fois et expire. Tout le reste — envoi d'e-mails, autres personnes,
identité visuelle — se fait ensuite dans l'interface.

:::note[La clé est tout le contrôle d'accès]
Qui peut lire `docker compose logs app` est l'exploitant. La clé n'existe qu'en mémoire : après
un redémarrage de `app`, une nouvelle clé s'applique. Dès qu'il existe une administratrice,
`/setup` disparaît définitivement — on ne peut pas prendre possession d'une installation une
seconde fois.
:::

### Deux autres façons de créer le premier admin

**En ligne de commande**, avec un shell sur le serveur :

```bash
docker compose exec app node scripts/cli.mjs admin create \
  --email you@example.com --first-name Anna --last-name Berger
```

**Au tout premier démarrage :** mets `GW_BOOTSTRAP_ADMIN_EMAIL=you@example.com` dans le `.env`
avant que la stack ne démarre pour la première fois. Le lien figure alors dans
`docker compose logs migrate`, est valable une heure et n'est imprimé qu'une seule fois. C'est
prévu pour les installations mises en place par un script plutôt que par une personne.

Si tu ne trouves ni la clé ni le lien,
[Connexion et lien de connexion](/fr/troubleshooting/sign-in/) t'aidera.

## Pour aller plus loin

- [Configuration](/fr/self-hosting/configuration/) : toutes les variables importantes
- [HTTPS et reverse proxy](/fr/self-hosting/tls/) : sans Caddy ou derrière ton propre proxy
- [Mettre à jour et sauvegarder](/fr/self-hosting/upgrade/) : mises à jour et sauvegardes
- [Protection des données](/fr/self-hosting/data-protection/) : ce que tu dois savoir en tant qu'exploitant
