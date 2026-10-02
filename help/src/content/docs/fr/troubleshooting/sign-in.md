---
title: Connexion et lien de connexion
description: Quand le lien de connexion n'arrive pas ou a expiré, quand le passkey échoue ou quand la mise en route d'une nouvelle installation bloque.
sidebar:
  order: 2
---

GoodWorkshop n'a pas de mot de passe. Tu te connectes soit avec **Se connecter avec un passkey**,
soit tu te fais envoyer un lien par e-mail avec **Envoyer un lien de connexion**. Les messages
ci-dessous apparaissent exactement ainsi dans l'app — cherche le texte que tu vois.

## « Regarde dans ta boîte mail. » — mais rien n'arrive

Après l'envoi, la page de connexion affiche **toujours** « Regarde dans ta boîte mail. S'il existe
un compte pour cette adresse, un lien de connexion est en route. » C'est voulu : la page ne révèle
à personne quelles adresses ont un compte. C'est aussi pourquoi tu ne vois aucune erreur quand
quelque chose n'a pas marché.

Vérifie dans l'ordre :

1. Regarde dans le **dossier spam**.
2. **Vérifie l'adresse.** Un lien ne part que vers une adresse liée à un compte actif. Les fautes de
   frappe passent inaperçues, car la page affiche la même chose dans tous les cas.
3. **Attends un peu.** Au maximum cinq liens partent par adresse en 15 minutes. Les demandes
   suivantes sont ignorées sans message.
4. **Auto-hébergement :** l'envoi d'e-mails est-il seulement configuré ? Voir plus bas.

### Auto-hébergement : pas d'envoi d'e-mails

Une installation toute neuve n'envoie aucun e-mail tant que personne n'a configuré l'envoi. En tant
qu'admin, vérifie sous **Envoi d'e-mails** qu'un transport est choisi, et utilise
**Envoyer un message de test** à cet endroit. Si `GW_MAIL_TRANSPORT` figure dans le `.env`, c'est
le `.env` qui l'emporte.

Si l'envoi échoue, le journal de l'app l'indique par `magic link delivery failed`. Avec Microsoft
Graph, `403` ou `invalid_client` signalent une **autorisation d'application** `Mail.Send` manquante
avec consentement administrateur, ou un secret expiré. Avec `GW_MAIL_TRANSPORT=console`, le lien
figure dans `docker compose logs app`.

Sans aucun envoi d'e-mails, tu peux entrer par la ligne de commande. Le lien est valable 15 minutes
et une seule fois :

```bash
docker compose exec app node scripts/cli.mjs login-link --email you@example.com
```

## « Ce lien a expiré ou a déjà été utilisé. Demandes-en un nouveau. »

Un lien de connexion est valable une seule fois et peu de temps — la durée figure dans l'e-mail et
sur la page de connexion (normalement 15 minutes). Demandes-en un nouveau.

Le lien ne te connecte pas immédiatement : il ouvre la page **Confirmer la connexion**, et c'est
seulement le bouton **Se connecter** qui l'utilise. Ainsi, les filtres de messagerie comme Microsoft
Defender Safe Links, qui ouvrent chaque lien à l'avance, ne peuvent pas l'utiliser avant toi.

## « Le lien était incomplet. Demandes-en un nouveau. »

L'adresse a été tronquée lors du copier-coller, par exemple par un retour à la ligne dans le
logiciel de messagerie. Clique sur le lien directement dans l'e-mail ou demandes-en un nouveau.

## L'adresse du lien est fausse (auto-hébergement)

Les liens de connexion sont construits à partir de `GW_APP_URL`. Si le lien pointe vers une autre
adresse que celle que tu utilises dans le navigateur, corrige `GW_APP_URL` dans le `.env` et
redémarre, voir [Configuration](/fr/self-hosting/configuration/).

## Passkey

| Message                                                                                                                    | Cause et solution                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « Les passkeys demandent HTTPS et ne sont pas disponibles sur cette adresse. Le lien de connexion par e-mail fonctionne. » | L'installation tourne sans HTTPS. Les navigateurs n'autorisent les passkeys qu'en HTTPS ou sur `localhost`. Utilise le lien de connexion, voir [HTTPS et reverse proxy](/fr/self-hosting/tls/).                                                    |
| « Les passkeys demandent HTTPS. Cette installation tourne sur … »                                                          | Même cause, lors de la création d'un passkey sous **Sécurité**.                                                                                                                                                                                    |
| « Le passkey n'a pas pu être confirmé. »                                                                                   | Ce compte ne connaît pas (ou plus) ce passkey — par exemple parce qu'il a été supprimé —, le compte n'est pas actif, ou le nom d'hôte de l'installation a changé. Connecte-toi par lien de connexion et crée un nouveau passkey sous **Sécurité**. |

Si tu annules toi-même la demande de ton appareil, la page n'affiche aucune erreur — réessaie
simplement.

:::caution[Auto-hébergement : nom d'hôte modifié ?]
Les passkeys sont liés au nom d'hôte (`GW_RP_ID`). Après un changement de nom d'hôte, **tous** les
passkeys enregistrés sont invalides. Chacun doit se connecter une fois par lien de connexion et
créer de nouveaux passkeys.
:::

## « Connecte-toi, s'il te plaît. »

Ta session a expiré. Une session prend fin lorsqu'elle n'a pas été utilisée pendant un certain
temps (en auto-hébergement : `GW_SESSION_IDLE_DAYS`, 14 jours par défaut), et au plus tard après une
durée maximale fixe. Reconnecte-toi.

## Invitation à un atelier

| Message                                                                              | Signification                                                                                            |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| « Cela ne correspond pas. Vérifie l'adresse à laquelle l'invitation a été envoyée. » | L'adresse saisie n'est pas celle qui a été invitée.                                                      |
| « Cette invitation n'est plus valable »                                              | Le lien a été retiré, a expiré ou n'existe pas. La personne qui t'a invité peut en envoyer une nouvelle. |
| « Trop de tentatives. Attends une minute puis réessaie. »                            | Trop de saisies en peu de temps.                                                                         |

## Mettre en route une nouvelle installation (auto-hébergement)

| Problème                                    | Solution                                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pas de clé d'installation dans le journal   | La clé figure dans le journal de `app`, pas dans celui de `migrate`. Si elle n'y est pas, redémarre `app` : `docker compose restart app`, puis `docker compose logs app`. |
| « La clé d'installation est incorrecte. »   | La clé change à chaque redémarrage. Prends la **plus récente** du journal.                                                                                                |
| « Trop de tentatives. Réessaie plus tard. » | Attends une minute.                                                                                                                                                       |
| `/setup` redirige vers la connexion         | Il existe déjà une administratrice ou un administrateur. Si `GW_BOOTSTRAP_ADMIN_EMAIL` a été défini, le lien à usage unique figure dans `docker compose logs migrate`.    |
| Connecté, mais pas admin                    | `docker compose exec app node scripts/cli.mjs admin promote --email you@example.com`                                                                                      |

Tout cela est détaillé dans le README, sous
[Troubleshooting](https://github.com/roleALPHA/good-workshop/blob/main/README.md#troubleshooting).

## Pour aller plus loin

- [Passkeys](/fr/account/passkeys/)
- [Envoi d'e-mails](/fr/account/mail/)
- [Support](/fr/troubleshooting/support/) — si tu n'arrives pas du tout à entrer dans le Cloud
