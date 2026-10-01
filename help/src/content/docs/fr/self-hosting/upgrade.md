---
title: Mettre à jour et sauvegarder
description: Faire passer une installation auto-hébergée à une nouvelle version, comprendre les migrations et sauvegarder la base de données.
sidebar:
  order: 4
---

Chez GoodWorkshop, une mise à jour suit le même déroulement que l'installation : à chaque
démarrage, la même chaîne de vérification et de migration s'exécute. Avant, il y a toujours une
sauvegarde. Les détails se trouvent dans le README sous
[Updating](https://github.com/roleALPHA/good-workshop/blob/main/README.md#updating) et
[Backing up](https://github.com/roleALPHA/good-workshop/blob/main/README.md#backing-up) ainsi que
dans
[docs/installation-and-upgrade.md](https://github.com/roleALPHA/good-workshop/blob/main/docs/installation-and-upgrade.md).

## Passer à une nouvelle version

Les versions disponibles figurent sur la
[page des releases](https://github.com/roleALPHA/good-workshop/releases). Depuis le répertoire qui
contient le `compose.yaml` :

```bash
# 1. Back up. An upgrade without a backup is a bet.
scripts/backup.sh before-upgrade-$(date +%F).sql.gz

# 2. Fetch the new image. With GW_VERSION=latest that is all;
#    with a pinned version, point GW_VERSION in the .env at the new tag first.
docker compose pull

# 3. Bring it up.
docker compose --profile tls up -d
```

Avec une version fixe, tu saisis le nouveau numéro dans `GW_VERSION` avant l'étape 2 — sans
« v ». Sans le profil `tls`, omets `--profile tls`.

## Ce qui arrive à la base de données au démarrage

`migrate` s'exécute à chaque démarrage, et `app` l'attend. Ainsi, un conteneur qui tournerait
sur un schéma qu'il ne comprend pas ne démarre même pas.

| Étape              | Ce qu'elle fait                                                                   |
| ------------------ | --------------------------------------------------------------------------------- |
| `db-bootstrap.mjs` | crée les rôles et définit leurs mots de passe                                     |
| `preflight.mjs`    | **lit seulement** et vérifie que les données sont compatibles avec les migrations |
| `migrate.mjs`      | applique les migrations en attente                                                |
| `provision.mjs`    | installe les types de blocs                                                       |

### Quand la vérification préalable s'arrête

Si la vérification préalable trouve des lignes qui font obstacle à une migration, `migrate`
s'interrompt avec « MIGRATION STOPPED ». La base de données reste alors **inchangée** — il n'y a
rien à annuler. Le message indique les lignes concernées, la requête qui permet de les examiner
et la décision à prendre. Ensuite, tu redémarres avec la même commande.

Tu peux voir ce qu'une mise à jour trouverait sans mettre à jour :

```bash
docker compose run --rm migrate node scripts/preflight.mjs
```

:::caution[Si une migration échoue en cours de route]
C'est alors l'état de `drizzle.__drizzle_migrations` qui fait foi : il indique ce qui a été
appliqué. Le retour en arrière passe de là par la sauvegarde. La cause figure dans
`docker compose logs migrate`.
:::

### Mises à jour automatiques (Watchtower)

Un outil de mise à jour comme Watchtower remplace **uniquement** le conteneur qu'il surveille. Le
service `migrate` ne s'exécute alors jamais, et la nouvelle application tournerait sur l'ancien
schéma. C'est à cela que sert `GW_MIGRATE_ON_START=1`, combiné à un `compose.override.yaml` tiré
du README
([Automatic updates](https://github.com/roleALPHA/good-workshop/blob/main/README.md#automatic-updates)).
Le prix : `app` détient alors aussi les mots de passe du superutilisateur et de `gw_owner`, et la
séparation des rôles est levée pour ce conteneur. Décide-le en connaissance de cause.

## Sauvegarder

La base de données contient l'intégralité des données, logos compris — ce sont des lignes, pas des
fichiers. Un dump suffit :

```bash
scripts/backup.sh goodworkshop-$(date +%F).sql.gz
```

Utilise le script plutôt qu'une ligne `pg_dump` écrite à la main. Cette ligne crée un fichier même
si rien n'a été sauvegardé. Le script écrit d'abord à côté, vérifie que le dump est allé jusqu'à
sa ligne finale, et ne lui donne son nom définitif qu'ensuite.

### La clé d'application en fait partie

La clé d'application déchiffre les identifiants d'e-mail saisis dans l'interface. Elle ne figure
pas dans le dump :

```bash
docker compose exec -T app cat /run/db-secrets/app/secret-key > goodworkshop-key.txt
```

Si elle est perdue, la sauvegarde revient avec des identifiants d'e-mail **vides**. Tout le reste
— ateliers, membres, identité visuelle — y survit ; tu ressaisis les identifiants une fois.

### Ce qui doit figurer dans la sauvegarde nocturne

Exactement trois choses : le dump, la clé d'application et le `.env`. Pas les mots de passe de la
base — la stack les régénère au besoin. Vérifie ce que contient l'archive, pas seulement qu'elle
existe. Un dump raté peut laisser une archive gzip valide mais vide :

```bash
gzip -dc goodworkshop.sql.gz | tail -c 400 | grep -c 'dump complete'
```

Pour les sauvegardes hors site, le dépôt contient trois scripts, prévus comme timers systemd :

| Script                        | La question à laquelle il répond                | Où il tourne                           |
| ----------------------------- | ----------------------------------------------- | -------------------------------------- |
| `scripts/backup-offsite.sh`   | L'état du jour est-il stocké chiffré ailleurs ? | sur le serveur, chaque jour            |
| `scripts/backup-verify.sh`    | La sauvegarde se restaure-t-elle vraiment ?     | sur le serveur, chaque semaine         |
| `scripts/backup-freshness.sh` | Les sauvegardes ont-elles encore lieu ?         | **sur une autre machine**, chaque jour |

La configuration et les unités systemd figurent dans le README.

## Restaurer

Les mots de passe de la base ne figurent pas dans le dump, et une restauration sur un nouveau
serveur n'en a pas besoin non plus : `secrets` en génère de nouveaux et `migrate` les applique aux
rôles. Les rôles eux-mêmes ne sont contenus dans aucun dump ; c'est `db-bootstrap.mjs` qui les
crée. Pour restaurer, il te faut donc le dump, la clé d'application et le `.env`.

Le dépôt ne documente pas de commande de restauration toute prête pour l'installation en service.
La manière de recharger un dump dans un Postgres neuf est montrée par `scripts/backup-verify.sh` :
il fait exactement cela dans des conteneurs jetables, sans toucher à la stack de production.
Essaie la restauration avant d'en avoir besoin.

:::note[La conservation est une promesse]
La sauvegarde hors site conserve 14 états quotidiens, 8 hebdomadaires et 12 mensuels. Ce que tu
paramètres doit aussi figurer dans ta politique de confidentialité, voir
[Protection des données](/fr/self-hosting/data-protection/).
:::

## Pour aller plus loin

- [Installation](/fr/self-hosting/installation/)
- [Configuration](/fr/self-hosting/configuration/)
- [Problèmes connus](/fr/troubleshooting/known-issues/)
