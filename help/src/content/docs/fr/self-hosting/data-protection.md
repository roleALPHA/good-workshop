---
title: Protection des données
description: Ce qu'une installation GoodWorkshop auto-hébergée stocke, où vont les données et ce que tu dois régler toi-même en tant que responsable du traitement.
sidebar:
  order: 5
---

:::caution[Pas un conseil juridique]
Cette page décrit de manière factuelle ce que GoodWorkshop stocke et où il envoie des données.
C'est un résumé de
[docs/data-protection.md](https://github.com/roleALPHA/good-workshop/blob/main/docs/data-protection.md) ;
on y trouve toutes les tables, requêtes et justifications.
:::

## Qui est responsable

Quiconque installe GoodWorkshop soi-même est **responsable du traitement** de toutes les données
qu'il contient. roleALPHA publie uniquement le logiciel et ne reçoit rien d'une installation : pas
de télémétrie, pas de « téléphone maison », pas de vérification de licence. L'image définit
`NEXT_TELEMETRY_DISABLED=1` pour que Next.js n'envoie rien non plus.

Dans la [GoodWorkshop Cloud](/fr/cloud/overview/), c'est différent : c'est nous qui exploitons
l'installation, avec un contrat de sous-traitance au sens de l'art. 28 du RGPD.

## Ce qui est stocké, et où

Tout se trouve dans une seule base de données Postgres. Les données personnelles ne sont écrites
dans aucun second stockage.

| Quoi                              | Données personnelles                                              | Origine                                     |
| --------------------------------- | ----------------------------------------------------------------- | ------------------------------------------- |
| Comptes et adhésions              | e-mail, langue, prénom et nom, rôle, statut                       | inscription ou invitation                   |
| Passkeys                          | clé publique, nom, compteur                                       | quiconque crée un passkey                   |
| Liens de connexion et invitations | e-mail, **IP du demandeur**, finalité, expiration                 | chaque lien de connexion, chaque invitation |
| Sessions                          | **IP, user-agent**, hash du secret de session                     | chaque connexion                            |
| Visites via lien d'invitation     | **IP, user-agent**                                                | chaque visite via un lien d'invitation      |
| Journal d'audit                   | qui a modifié quoi sur quel objet                                 | modifications via le web et MCP             |
| Ateliers, sections, blocs         | ce que saisissent les animateurs : noms, notes sur des personnes  | les animateurs                              |
| Édition en direct                 | le même contenu une seconde fois, sous forme de mises à jour CRDT | l'éditeur en direct                         |
| Jetons                            | hashes de jetons, liés à un membre                                | jetons créés par le membre                  |

Deux choses à savoir pour ton registre des activités de traitement :

- **Les adresses IP se trouvent à trois endroits** (liens de connexion, sessions, visites via lien
  d'invitation), et aucun d'eux n'expire de lui-même.
- **Le vrai risque, c'est le contenu des agendas**, pas les données de compte. Les agendas
  contiennent souvent des noms de participants, les notes d'animation des observations sur des
  personnes — en texte libre, et en plus dans l'historique de l'édition en direct.

La séparation entre espaces de travail est imposée par la base de données elle-même, via la
Row-Level Security.

## Par où les données quittent l'installation

Il y a exactement quatre voies, dont trois sont désactivées tant que tu ne les actives pas :

1. **E-mail.** Les liens de connexion et les invitations passent par ton relais SMTP ou par
   Microsoft Graph. L'adresse et le titre de l'atelier quittent le serveur. Avec `console`, rien
   n'est envoyé — un lien de connexion valide figure alors dans le journal.
2. **Assistants IA (MCP).** Les membres peuvent connecter un assistant à leurs ateliers. Son
   fournisseur reçoit le contenu des ateliers. Les champs privés comme les notes d'animation n'en
   font pas partie. Le fournisseur d'IA entre malgré tout dans ta chaîne de traitement.
3. **Liens d'invitation.** Quiconque a le lien voit l'agenda. Les visiteurs ne sont pas
   identifiés, mais leur IP et leur user-agent sont enregistrés.
4. **Let's Encrypt**, si tu utilises le Caddy fourni : ton nom d'hôte apparaît dans les journaux
   publics de Certificate Transparency.

Rien d'autre ne part sur le réseau : pas de polices externes, pas de CDN, pas d'outil d'analyse,
pas de service de suivi des erreurs.

## Ce que tu dois supprimer toi-même

:::danger[Pas de nettoyage automatique]
Une installation Community n'a pas de tâche de conservation. Les lignes expirées sont considérées
comme invalides à la lecture, mais ne sont jamais supprimées. La limitation de la conservation
(art. 5, par. 1, point e) du RGPD) relève de ta responsabilité en tant que responsable du
traitement.
:::

Une tâche planifiée suffit. Adapte les délais à la durée de conservation que tu as fixée et
documentée :

```sql
-- Login links and invitations: useless once expired.
DELETE FROM email_token   WHERE expires_at < now() - interval '30 days';

-- Sessions that can no longer be used.
DELETE FROM auth_session  WHERE expires_at < now() - interval '30 days'
                             OR revoked_at < now() - interval '30 days';
DELETE FROM share_session WHERE expires_at < now() - interval '30 days'
                             OR revoked_at < now() - interval '30 days';

-- The audit trail. Keep it as long as you can justify needing it, not longer.
DELETE FROM audit_event   WHERE created_at < now() - interval '1 year';
```

Exécute ces instructions avec le rôle owner, pas en tant que `gw_app` — la Row-Level Security
limite `gw_app` à un seul espace de travail.

## Droit d'accès et effacement

- **Suppression par la personne elle-même :** chaque personne supprime son compte sous
  **Profil et réglages** → **Supprimer le compte**. Le dernier admin actif ne le peut pas.
- **Par un admin :** sous **Administration** → **Membres**. La boîte de dialogue demande qui
  reprend les ateliers et les dossiers. Avec la dernière adhésion disparaît aussi le compte, avec
  ses sessions, liens de connexion et passkeys.

Ce qui n'est **pas** couvert et que tu dois vérifier à la main : les noms dans le texte des agendas
et dans les notes d'animation, ces mêmes noms dans l'historique de l'édition en direct et les
citations dans le journal d'audit. Les noms dans le champ **Responsable** restent eux aussi sur les
blocs, pour que l'agenda reste lisible. Si un effacement doit être complet, supprime l'atelier
concerné : d'abord dans la corbeille, puis vide la corbeille. Cela emporte aussi l'historique des
modifications.

## Ce que tu règles toi-même en tant qu'exploitant

- fixer et documenter les durées de conservation, et planifier les suppressions ci-dessus
- un registre des activités de traitement (art. 30 du RGPD)
- des contrats de sous-traitance avec le relais e-mail, l'hébergeur et — si MCP est utilisé — le
  fournisseur d'IA
- une politique de confidentialité pour les personnes dont le nom figure dans des agendas
- les sauvegardes : les suppressions n'atteignent pas les sauvegardes déjà effectuées, voir
  [Mettre à jour et sauvegarder](/fr/self-hosting/upgrade/)
- le chiffrement du disque : Caddy assure le HTTPS, pas le chiffrement au repos

## Pour aller plus loin

- [Membres](/fr/account/members/)
- [Corbeille](/fr/library/trash/)
- [Planifier avec l'assistant IA](/fr/ai/introduction/)
- [Liens d'invitation](/fr/sharing/share-links/)
