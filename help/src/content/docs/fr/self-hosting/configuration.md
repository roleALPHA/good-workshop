---
title: Configuration
description: Les principales variables d'environnement d'une installation GoodWorkshop auto-hébergée, regroupées par usage.
sidebar:
  order: 2
---

Une installation auto-hébergée se configure via le `.env` situé à côté du `compose.yaml`. Cette
page classe les principales variables par usage. Le tableau complet et de référence se trouve
dans la section
[Configuration](https://github.com/roleALPHA/good-workshop/blob/main/README.md#configuration) du
README ; chaque variable est en outre commentée dans le `.env.example`.

:::note[Pas de mots de passe de base de données dans le `.env`]
La stack génère elle-même les mots de passe des rôles de la base au premier démarrage, dans des
volumes Docker dédiés. Il n'y a rien à saisir pour cela.
:::

## Valeurs obligatoires

| Variable      | Obligatoire | Signification                                                                                                  |
| ------------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| `GW_APP_URL`  | oui         | Adresse à laquelle l'application est joignable. Les liens de connexion et l'origine des passkeys en dépendent. |
| `GW_HOSTNAME` | pour `tls`  | Nom dans le certificat, transmis à Caddy.                                                                      |
| `GW_VERSION`  | oui         | Tag de l'image : `latest` ou un numéro fixe comme `0.8.22`. Figure dans le pied de page et dans `/api/health`. |

`GW_APP_URL` doit être exactement l'adresse affichée dans le navigateur. Si elle ne correspond
pas, les liens de connexion ouvrent la mauvaise adresse et l'éditeur en direct reste sans
connexion.

## Envoi d'e-mails

Tu peux configurer l'envoi d'e-mails dans l'interface sous **Envoi d'e-mails**
([Envoi d'e-mails](/fr/account/mail/)) ou dans le `.env`. L'environnement l'emporte champ par
champ ; l'interface marque ces champs avec **depuis l'environnement**.

| Variable                                                 | Quand        | Signification                                                                          |
| -------------------------------------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| `GW_MAIL_TRANSPORT`                                      | facultatif   | `smtp`, `graph`, `console` ou `none`. Vide : les réglages de l'interface s'appliquent. |
| `SMTP_URL` / `SMTP_URL_FILE`                             | avec `smtp`  | URL du relais, directement ou depuis un fichier                                        |
| `SMTP_FROM`                                              | avec `smtp`  | Adresse d'expéditeur                                                                   |
| `GW_GRAPH_TENANT_ID`                                     | avec `graph` | Locataire Microsoft 365, sous forme de domaine ou d'ID d'annuaire                      |
| `GW_GRAPH_CLIENT_ID`                                     | avec `graph` | ID d'application de l'enregistrement d'application                                     |
| `GW_GRAPH_CLIENT_SECRET` / `GW_GRAPH_CLIENT_SECRET_FILE` | avec `graph` | Secret de l'enregistrement, directement ou depuis un fichier                           |
| `GW_GRAPH_SENDER`                                        | avec `graph` | Boîte aux lettres depuis laquelle les e-mails sont envoyés                             |

Pour Microsoft Graph, il te faut un enregistrement d'application dans Entra ID avec
l'**autorisation d'application** `Mail.Send` (et non l'autorisation déléguée) et le consentement
administrateur.

:::tip[Les secrets dans des fichiers]
Si `SMTP_URL` contient un mot de passe, il doit aller dans un fichier :
`SMTP_URL_FILE=/run/secrets/smtp_url`. Une variable d'environnement apparaît dans
`docker inspect`, dans `/proc/<pid>/environ` et dans chaque core dump. Il en va de même pour
`GW_GRAPH_CLIENT_SECRET_FILE`.
:::

:::caution[`console` est un choix délibéré]
Avec `GW_MAIL_TRANSPORT=console`, des liens de connexion complets et valides atterrissent dans le
journal du conteneur. Quiconque peut lire `docker logs` — le groupe Docker, un collecteur de logs,
un extrait envoyé au support — peut se faire émettre un lien pour **n'importe quelle** adresse.
L'application t'en avertit au démarrage.
:::

## Connexion et sessions

| Variable               | Par défaut           | Signification                                                                                                            |
| ---------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `GW_RP_ID`             | hôte de `GW_APP_URL` | ID de relying party WebAuthn. Le modifier plus tard invalide chaque passkey.                                             |
| `GW_SESSION_IDLE_DAYS` | `14`                 | Nombre de jours sans utilisation après lesquels une session expire                                                       |
| `GW_TRUSTED_PROXIES`   | `1`                  | Nombre de proxys devant l'application. Uniquement pour la limitation de débit et les logs, jamais pour une autorisation. |

## Premier compte admin

Uniquement pour les installations mises en place par un script. La voie normale est `/setup`,
voir [Installation](/fr/self-hosting/installation/).

| Variable                        | Signification                                               |
| ------------------------------- | ----------------------------------------------------------- |
| `GW_BOOTSTRAP_ADMIN_EMAIL`      | Crée un admin au tout premier démarrage et imprime son lien |
| `GW_BOOTSTRAP_ADMIN_FIRST_NAME` | Prénom, facultatif                                          |
| `GW_BOOTSTRAP_ADMIN_LAST_NAME`  | Nom, facultatif                                             |

## Exploitation

| Variable                                  | Par défaut      | Signification                                                                                                       |
| ----------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------- |
| `GW_TIMEZONE`                             | `Europe/Berlin` | Fuseau horaire des dates dans l'interface. À définir explicitement pour que serveur et navigateur formatent pareil. |
| `GW_SECRET_KEY` / `GW_SECRET_KEY_FILE`    | généré          | Chiffre les identifiants d'e-mail saisis dans l'interface. **À inclure dans la sauvegarde.**                        |
| `GW_OPS_TOKEN`                            | vide            | Rend `/api/health` détaillé avec l'en-tête `x-ops-token` : version, état des migrations, erreurs de pilote.         |
| `GW_MIGRATE_ON_START`                     | désactivé       | `1` fait migrer `app` avant le démarrage, pour des outils de mise à jour comme Watchtower                           |
| `GW_PORT`, `GW_COLLAB_PORT`               | `3000`, `3001`  | Ports sur `127.0.0.1`, si les valeurs par défaut sont occupées                                                      |
| `GW_COLLAB_URL`, `GW_COLLAB_INTERNAL_URL` | vide            | Nécessaires uniquement si le service de collaboration ne se trouve pas sous `/collab` sur le même hôte              |

Sans `GW_OPS_TOKEN`, `/api/health` ne répond qu'avec le statut et les noms des vérifications — le
point de terminaison est joignable publiquement. Ce qu'il en est de `GW_SECRET_KEY` et de
`GW_MIGRATE_ON_START` est expliqué sous [Mettre à jour et sauvegarder](/fr/self-hosting/upgrade/).

## Appliquer les modifications

Après une modification du `.env`, relance la stack :

```bash
docker compose --profile tls up -d
```

Sans le profil `tls` (proxy propre, tunnel SSH), omets `--profile tls`, voir
[HTTPS et reverse proxy](/fr/self-hosting/tls/).

## Pour aller plus loin

- [Installation](/fr/self-hosting/installation/)
- [HTTPS et reverse proxy](/fr/self-hosting/tls/)
- [Envoi d'e-mails](/fr/account/mail/)
- [Connexion et lien de connexion](/fr/troubleshooting/sign-in/)
