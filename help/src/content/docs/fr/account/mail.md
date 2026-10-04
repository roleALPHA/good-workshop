---
title: Envoi d'e-mails
description: Définir comment GoodWorkshop envoie les liens de connexion et les invitations – par SMTP ou Microsoft 365 – et tester l'envoi.
sidebar:
  order: 5
---

GoodWorkshop envoie les liens de connexion et les invitations par e-mail. Sans envoi d'e-mails, seules
les personnes qui ont déjà un [passkey](/fr/account/passkeys/) peuvent entrer. Si tu héberges
GoodWorkshop toi-même, c'est ici que tu le configures. Dans GoodWorkshop Cloud, il est déjà configuré,
et tu peux utiliser le tien à la place – voir [Dans GoodWorkshop Cloud](#dans-goodworkshop-cloud).

Ouvre le menu du compte en haut à droite et choisis, sous **Administration**, l'entrée **Envoi d'e-mails**.

:::note
Seuls les admins configurent l'envoi d'e-mails.
:::

## Choisir la méthode

En auto-hébergement, quatre possibilités s'offrent à toi sous **Comment les e-mails doivent-ils être envoyés ?** :

| Méthode                               | Pour quoi                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------- |
| **Microsoft Graph**                   | Pour Microsoft 365 sans SMTP AUTH.                                           |
| **SMTP**                              | Un relais de messagerie classique.                                           |
| **Écrire dans le journal du serveur** | Pas d'envoi. Les liens de connexion atterrissent dans le journal du serveur. |
| **Pas d'envoi**                       | Les liens de connexion ne s'obtiennent qu'en ligne de commande.              |

:::caution
**Écrire dans le journal du serveur** est prévu pour les débuts ou une installation de test. Qui peut lire le
journal peut entrer dans n'importe quel compte.
:::

## Dans GoodWorkshop Cloud

Dans le cloud, l'envoi d'e-mails est configuré dès le départ. Sous **Comment les e-mails
doivent-ils être envoyés ?**, trois possibilités s'offrent à toi :

| Méthode                      | Pour quoi                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| **Envoyer via GoodWorkshop** | Par défaut. Les e-mails partent de `no-reply@goodworkshop.org`, rien à configurer. |
| **Microsoft Graph**          | Ton propre Microsoft 365, configuré comme décrit plus bas.                         |
| **SMTP**                     | Ton propre relais de messagerie, configuré comme décrit plus bas.                  |

Avec ton propre envoi, les liens de connexion et les invitations de ton espace de travail partent de
ton adresse. Dans le cloud, SMTP a deux limites : uniquement les ports 465 (`smtps://`) et 587
(STARTTLS), et uniquement des serveurs à adresse publique. La page n'accepte pas un serveur sur un
réseau privé ou local.

:::note
Si ton propre envoi échoue, l'e-mail passe par GoodWorkshop à la place – un relais en panne ne
bloque ainsi personne. La page **Envoi d'e-mails** indique alors quand et avec quelle erreur. Le
message disparaît au prochain **Enregistrer**. Le message de test ne prend pas ce détour, pour que
tu voies l'erreur.
:::

Pour revenir à l'envoi via GoodWorkshop, choisis **Envoyer via GoodWorkshop** puis
**Enregistrer**. Ce que tu as saisi pour ton propre envoi reste enregistré.

## Configurer SMTP

1. Choisis **SMTP**.
2. Sous **URL SMTP**, saisis l'adresse de ton relais avec les identifiants, par exemple
   `smtps://utilisateur:motdepasse@relay.example.com:465`.
3. Sous **Adresse d'expéditeur**, saisis l'adresse depuis laquelle les e-mails doivent partir.
4. Clique sur **Enregistrer**.

## Configurer Microsoft 365 via Graph

Beaucoup d'organisations Microsoft 365 ont désactivé SMTP AUTH. Il reste alors la voie de
Microsoft Graph.

Il te faut pour cela un enregistrement d'application dans Entra ID avec l'**autorisation d'application**
`Mail.Send` et le consentement administrateur. Tu en reprends :

| Champ                             | Origine                                           |
| --------------------------------- | ------------------------------------------------- |
| **ID d'annuaire ou de locataire** | l'ID de ton annuaire Entra                        |
| **ID d'application**              | l'ID de l'enregistrement d'application            |
| **Secret client**                 | une clé secrète de l'enregistrement d'application |
| **Boîte d'expédition**            | la boîte aux lettres depuis laquelle on envoie    |

Choisis **Microsoft Graph**, remplis les quatre champs et clique sur **Enregistrer**.

## Les secrets restent secrets

Le mot de passe dans l'URL SMTP et le secret client sont enregistrés chiffrés et ne sont plus jamais
affichés. Si l'un d'eux est enregistré, le champ indique « enregistré — laisse vide pour le
conserver ». Si tu le laisses vide, la valeur enregistrée est conservée.

## Valeurs issues de l'environnement

Si tu héberges GoodWorkshop toi-même, tu peux aussi définir l'envoi d'e-mails dans le `.env` de l'installation. Le cloud n'a pas de telles valeurs ; rien n'y verrouille tes champs.
Ces valeurs sont prioritaires. La page affiche ces champs verrouillés, avec la
mention **depuis l'environnement** ; ils ne peuvent être modifiés que sur le serveur.

| Variable                                                                                | Champ                                             |
| --------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `GW_MAIL_TRANSPORT`                                                                     | la méthode : `smtp`, `graph`, `console` ou `none` |
| `SMTP_URL`, `SMTP_FROM`                                                                 | **URL SMTP**, **Adresse d'expéditeur**            |
| `GW_GRAPH_TENANT_ID`, `GW_GRAPH_CLIENT_ID`, `GW_GRAPH_CLIENT_SECRET`, `GW_GRAPH_SENDER` | les quatre champs Graph                           |

Plus d'informations sur ces variables sous [Configuration](/fr/self-hosting/configuration/).

## Envoyer un message de test

On ne sait si un relais fonctionne qu'au moment d'envoyer. Sans test, le premier essai est
le lien de connexion de quelqu'un – et une erreur ressemble alors à un compte cassé.

1. Enregistre d'abord tes réglages. Le test utilise ce qui est enregistré.
2. Sous **Envoyer un message de test**, saisis une adresse dans le champ **À**.
3. Clique sur **Envoyer**.

Si cela fonctionne, la page indique « Envoyé à … Si rien n'arrive : dossier indésirables. » Si
l'envoi échoue, la page affiche mot pour mot la réponse du serveur de messagerie, par exemple
`535 authentication failed`. C'est exactement ce message qu'il te faut pour trouver l'erreur.

:::tip
Si le message de test arrive, les liens de connexion et les invitations empruntent désormais le même chemin.
:::

## Travailler sans envoi d'e-mails

Même sans aucun envoi d'e-mails, tu peux faire entrer des personnes dans l'espace de travail : lors de
l'[invitation](/fr/account/members/), GoodWorkshop affiche alors directement le lien de connexion, et tu
le transmets en personne. Avec un passkey, tout le monde entre ensuite sans e-mail.

## Voir aussi

- [Connexion et lien de connexion](/fr/troubleshooting/sign-in/)
- [Configuration](/fr/self-hosting/configuration/)
- [Passkeys](/fr/account/passkeys/)
- [Membres](/fr/account/members/)
