---
title: Tarifs et facturation
description: Les deux modèles de facturation du Cloud, le moyen de paiement, le changement de formule, la résiliation et la signification des états d'un espace de travail.
sidebar:
  order: 3
---

:::note
Cette page concerne uniquement GoodWorkshop Cloud. Seuls les admins voient la facturation.
:::

Tout ce qui touche à l'argent se trouve sur une seule page : ouvre le menu Compte en haut à
droite et choisis, sous **Administration**, l'entrée **Facturation**.

## Deux modèles de facturation

Un seul modèle s'applique par espace de travail. Tu le choisis à l'inscription et tu peux en
changer chaque mois.

| Modèle              | Ce qui est facturé                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| **Par utilisateur** | chaque membre actif par mois, au prorata journalier                                                     |
| **Par atelier**     | chaque nouvel atelier créé, une seule fois, le mois de sa création – quel que soit le nombre de membres |

Les montants actuels figurent sur la [page des tarifs](https://goodworkshop.org/fr/tarifs) et
dans la liste de choix sous **Modèle de facturation**. Tous les prix sont HT, TVA en sus :

- Les entreprises en Autriche paient 20 % de TVA.
- Les entreprises d'autres pays de l'UE disposant d'un numéro de TVA valide paient HT
  (autoliquidation).
- Les entreprises hors de l'UE ne paient pas de TVA autrichienne.

### Qui compte dans le modèle « Par utilisateur »

Chaque membre est compté pour chaque jour où son statut était **Active**. Les personnes invitées
qui ne se sont encore jamais connectées, les membres désactivés et les invités sans compte ne
comptent pas. Sous **Ce mois-ci jusqu’à présent**, tu vois l'état actuel, par exemple
« 3,5 utilisateurs-mois », et le montant HT à ce jour.

Les jours de la période d'essai et les ateliers créés pendant la période d'essai ne sont pas
facturés.

## Changer de modèle

1. Choisis l'autre modèle sous **Modèle de facturation**.
2. Clique sur **Appliquer**.

Un changement s'applique à partir du 1er du mois suivant. D'ici là, il est indiqué « À partir
du mois prochain : … » ; le mois en cours reste facturé selon le modèle actuel.

## Le moyen de paiement

Le paiement se fait par carte, prélevée par le prestataire de paiement. Tu saisis les données
de ta carte sur la page de celui-ci ; GoodWorkshop ne les voit ni ne les enregistre jamais.

1. Sous **Moyen de paiement**, clique sur **Ajouter un moyen de paiement** (ou plus tard
   **Changer de moyen de paiement**).
2. Saisis ta carte sur la page du prestataire de paiement.
3. Tu reviens à la facturation. Il y est indiqué « Un moyen de paiement est enregistré. »

Juste en dessous, tu peux utiliser un [bon](/fr/cloud/vouchers/).

## Les coordonnées de facturation

Sous **Coordonnées de facturation** figurent le **Nom de l’entreprise**, l'adresse, le
**Numéro de TVA** et l'**E-mail de facturation**, à laquelle sont envoyés les factures et les
avis de paiement. Tu enregistres les modifications avec **Enregistrer** ; GoodWorkshop vérifie
un numéro de TVA dans le registre européen VIES.

La facturation est mensuelle, à terme échu, avec un prélèvement au plus tôt deux jours après la
facture. Plus de détails dans [Factures](/fr/cloud/invoices/).

## Les états d'un espace de travail

Sous **Facturation**, le statut est indiqué ; sous l'en-tête, tout le monde voit un message
correspondant.

| Statut                 | Message sous l'en-tête                             | Ce que cela signifie                                                                                                                   | Pour la suite                                                                                                                                   |
| ---------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Essai jusqu’au …**   | « Essai : encore … jours. »                        | Tout fonctionne, gratuitement.                                                                                                         | À la fin, avec un moyen de paiement, **Actif**, sans passer par **Lecture seule**.                                                              |
| **Actif**              | aucun                                              | Tout fonctionne.                                                                                                                       | –                                                                                                                                               |
| **Lecture seule**      | « lecture et export possibles, modification non. » | La période d'essai s'est terminée sans moyen de paiement, ou une facture n'a pas pu être prélevée même après les nouvelles tentatives. | Après la période d'essai : enregistrer un moyen de paiement. En cas de facture impayée : régler le paiement, tu reçois un rappel avec un délai. |
| bloqué                 | « … bloqué en raison d'une facture impayée. »      | Aucun paiement n'est arrivé dans les 14 jours suivant le rappel de paiement. L'export reste possible.                                  | Dès que le paiement arrive, tout reprend de lui-même.                                                                                           |
| **En pause**           | « Le contenu peut être lu mais pas modifié. »      | Nous avons suspendu l'espace de travail.                                                                                               | Écris au [Support](/fr/troubleshooting/support/).                                                                                               |
| **Sera supprimé le …** | « … sera supprimé le … »                           | Suppression demandée ou contrat terminé. Lecture et export possibles jusqu'à cette date.                                               | D'ici là, **Annuler la suppression** l'arrête, même après une résiliation.                                                                      |

:::tip
Même en lecture seule, bloqué ou avant la suppression, tu peux
[exporter tes ateliers en Markdown](/fr/sharing/export/).
:::

## Résilier

Le contrat peut être résilié pour la fin de chaque mois civil.

1. Sous **Résilier le contrat**, clique sur **Résilier le contrat**.
2. Lis l'avertissement et clique sur **Résilier à la fin du mois**.

Jusqu'à la fin du mois, vous continuez à travailler normalement, et le dernier mois est
facturé normalement. Ensuite, l'espace de travail passe en lecture seule (statut
**Sera supprimé le …**) ; pendant 30 jours, tous les ateliers restent exportables, puis les
contenus sont supprimés. Jusqu'à la fin du mois, tu peux annuler la résiliation avec
**Retirer la résiliation**, ensuite avec **Annuler la suppression** – l'espace de travail continue
alors comme si tu n'avais pas résilié. Un [bon](/fr/cloud/vouchers/) n'y change rien : il décide de
ce qui est facturé, pas de la durée du contrat.

## Supprimer l'espace de travail immédiatement

**Supprimer l’espace de travail** n'attend pas la fin du mois. Pour confirmer, tape le nom de
l'espace de travail et clique sur **Demander la suppression**. L'espace de travail passe
immédiatement en lecture seule et est supprimé définitivement après 30 jours, avec tous les
ateliers, membres et partages. Le mois en cours est facturé au prorata. D'ici là, tu peux
annuler avec **Annuler la suppression**.

:::danger
Une fois les 30 jours écoulés, les contenus ont disparu. Exporte avant ce que tu veux garder.
:::

## Changements de tarifs

Tu es informé des nouveaux tarifs au moins six semaines à l'avance, par e-mail et sous
l'en-tête (« De nouveaux tarifs s'appliquent à partir du … »). Ils s'appliquent à partir du
1er d'un mois ; en cas de hausse, tu peux résilier d'ici là.

## Voir aussi

- [Factures](/fr/cloud/invoices/)
- [Bons de réduction](/fr/cloud/vouchers/)
- [Membres](/fr/account/members/)
- [Tarifs](https://goodworkshop.org/fr/tarifs) et [conditions générales](https://goodworkshop.org/fr/conditions-generales)
