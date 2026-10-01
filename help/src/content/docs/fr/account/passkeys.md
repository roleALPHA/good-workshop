---
title: Passkeys
description: Se connecter avec une empreinte digitale, son visage ou une clé de sécurité plutôt qu'avec un lien par e-mail.
sidebar:
  order: 2
---

GoodWorkshop n'a pas de mot de passe. Tu te connectes soit via un **lien de connexion par e-mail**,
soit avec un **passkey**. Un passkey est une clé stockée sur ton appareil, que tu déverrouilles
avec ton empreinte digitale, ton visage, le code PIN de l'appareil ou une clé de sécurité. La
clé elle-même ne quitte jamais ton appareil.

L'avantage : tu n'as pas à attendre un e-mail. Surtout sur le téléphone, dans la salle d'atelier,
c'est souvent le moyen le plus rapide d'entrer.

## Créer un passkey

1. Ouvre le menu du compte en haut à droite et choisis **Sécurité**.
2. Sous **Nom (facultatif)**, saisis un nom qui te permettra de reconnaître l'appareil plus tard, par exemple
   « MacBook », « iPhone » ou « YubiKey ». Si tu laisses le champ vide, GoodWorkshop en attribue un.
3. Clique sur **Créer un passkey**. Le bouton affiche maintenant **En attente de l'appareil …**
4. Confirme dans la boîte de dialogue de ton navigateur ou de ton système d'exploitation, par exemple avec
   ton empreinte digitale.

Ensuite, la page se recharge et le passkey apparaît dans la liste.

:::tip
Crée un passkey sur chaque appareil avec lequel tu travailles régulièrement – ou utilise-en un qui
se synchronise via ton compte Apple, Google ou un gestionnaire de mots de passe.
:::

## Lire la liste

Chaque passkey figure dans la liste avec son nom, accompagné de :

| Indication                       | Signification                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------- |
| **synchronisé**                  | Le passkey est synchronisé entre tes appareils, par exemple via un gestionnaire de mots de passe. |
| **dernière fois le** et une date | La dernière fois que tu t'es connecté avec.                                                       |
| **pas encore utilisé**           | Tu l'as créé, mais jamais utilisé pour te connecter.                                              |

Si tu n'as pas encore de passkey, la liste indique : « Pas encore de passkey. En attendant, chaque
connexion passe par un lien envoyé par e-mail. »

## Se connecter avec un passkey

Sur la page de connexion, clique sur **Se connecter avec un passkey** et confirme sur ton appareil. Tu
n'as pas besoin de saisir d'adresse e-mail.

Le lien de connexion par e-mail continue de fonctionner, même si tu as des passkeys. C'est ton
moyen d'entrer quand tu es sur l'appareil de quelqu'un d'autre.

## Supprimer un passkey

Dans la ligne du passkey, clique sur **Supprimer**. Il disparaît immédiatement, sans confirmation.
Supprime un passkey par exemple quand tu vends ou perds un appareil.

## Quand aucun passkey ne peut être créé

Les navigateurs n'autorisent les passkeys qu'en HTTPS (ou sur `localhost`). Si une installation tourne
sur une simple adresse `http://`, la page affiche un message et **Créer un passkey** est
désactivé. Le lien de connexion par e-mail reste alors le moyen d'entrer.

:::note
Cela ne concerne que les installations auto-hébergées. La configuration de HTTPS est expliquée sous
[HTTPS et proxy inverse](/fr/self-hosting/tls/).
:::

Autres messages et leur signification :

- **Le passkey n'a pas pu être confirmé.** L'appareil a répondu, mais le serveur n'a pas pu
  vérifier la réponse. Réessaie.
- **Ce passkey est inconnu.** Lors de la connexion, un passkey inconnu de GoodWorkshop a été
  utilisé – par exemple parce qu'il a été supprimé. Connecte-toi par lien de connexion et
  crées-en un nouveau.

Si tu annules toi-même la boîte de dialogue de l'appareil, il ne se passe tout simplement rien – cela ne mérite pas de
message d'erreur.

:::tip[Pour les admins d'installations auto-hébergées]
Sans [envoi d'e-mails](/fr/account/mail/) configuré, seules les personnes qui ont déjà un
passkey peuvent entrer. Un passkey pour toi-même est donc une bonne assurance.
:::

## Voir aussi

- [Profil et langue](/fr/account/profile-and-language/)
- [Connexion et lien de connexion](/fr/troubleshooting/sign-in/)
- [Envoi d'e-mails](/fr/account/mail/)
