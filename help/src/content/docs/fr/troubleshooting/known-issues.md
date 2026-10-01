---
title: Problèmes connus
description: Les limites actuelles de GoodWorkshop, consignées comme telles dans la documentation ou dans le code.
sidebar:
  order: 4
---

Cette page recense ce que GoodWorkshop ne sait volontairement pas faire, ou pas encore. La liste est
courte, car elle ne reprend que ce que le projet lui-même consigne comme limite. Les bugs qui n'y
figurent pas, tu les signales via le [Support](/fr/troubleshooting/support/).

## Pour tout le monde

### Un accès OAuth ne peut pas être révoqué dans GoodWorkshop

Si tu connectes Claude, ChatGPT ou un autre client par OAuth, l'accès ne prend fin pour l'instant
que lorsque tu déconnectes le connecteur dans le client. La page d'autorisation mentionne bien les
réglages sous **Connexion IA**, mais il n'y a pas encore de bouton pour les accès OAuth. Les jetons,
tu les révoques à cet endroit avec **Révoquer**. Voir [Connexion IA](/fr/troubleshooting/ai-connection/).

### Après la connexion, pas de retour à la page d'autorisation

Si tu n'es pas connecté quand un client t'envoie vers la page d'autorisation, tu te connectes et tu
arrives dans la bibliothèque au lieu de **Autoriser l'accès ?**. Relance alors la connexion depuis
le client. Solution : te connecter d'abord dans le même navigateur.

### Les champs de texte mis en forme ne sont pas modifiables

Tu peux modifier des paragraphes simples dans n'importe quel champ de texte. Mais si un champ
contient de la mise en forme, comme des listes ou du gras, l'éditeur affiche : « Contient de la mise
en forme. L'édition arrivera avec l'éditeur de texte — d'ici là, le contenu reste intact. » Le
contenu est conservé en entier au lieu d'être aplati à la première frappe — mais pour l'instant, il
est en lecture seule dans l'éditeur.

### Un nom supprimé reste dans l'historique d'édition

Si tu supprimes un nom dans l'éditeur, il disparaît de l'agenda actuel, mais pas encore de
l'historique de l'édition en direct. Si quelque chose doit disparaître complètement, supprime
l'atelier et vide la [corbeille](/fr/library/trash/).

## Auto-hébergement

### Passkeys uniquement avec HTTPS et un nom d'hôte fixe

Sans HTTPS, il n'y a pas de passkeys, sauf sur `localhost` ; le lien de connexion par e-mail est
alors le seul moyen d'entrer. Changer le nom d'hôte après l'enregistrement de passkeys les rend tous
invalides. Voir [HTTPS et reverse proxy](/fr/self-hosting/tls/).

### Pas de suppression automatique des anciennes données

Une installation Community n'a pas de tâche de conservation. Les liens de connexion expirés, les
sessions, les visites via les liens d'invitation (chacun avec l'adresse IP) et le journal d'audit
restent en place jusqu'à ce que tu les supprimes. Les requêtes nécessaires figurent dans
[Protection des données](/fr/self-hosting/data-protection/).

### Les mises à jour automatiques sautent la migration

Un outil de mise à jour comme Watchtower ne remplace que le conteneur de l'app ; le service
`migrate` ne s'exécute pas. Sans `GW_MIGRATE_ON_START=1` et le fichier override correspondant, la
nouvelle app démarre sur l'ancien schéma. Voir [Mettre à jour et sauvegarder](/fr/self-hosting/upgrade/).

### La limitation s'applique par processus

Les limites pour les demandes de passkey et pour `/api/mcp` sont comptées en mémoire. Si plusieurs
conteneurs d'app tournent côte à côte, la limite effective est multipliée par leur nombre. La limite
de liens de connexion par adresse destinataire, en revanche, est comptée dans la base de données et
s'applique exactement.

### Sans adresse d'origine correcte, un compteur commun

Si aucune adresse d'origine n'arrive derrière le proxy, toutes les requêtes tombent dans le même
compteur — `/api/mcp` peut alors répondre `rate_limited` alors que chaque personne fait peu de
choses. Vérifie `X-Forwarded-For` et `GW_TRUSTED_PROXIES`.

### Les identifiants de messagerie dépendent de la clé de l'application

Une sauvegarde sans la clé de l'application revient avec des identifiants de messagerie vides. Tout
le reste est conservé ; tu ressaisis les identifiants. Sauvegarde la clé avec le reste, voir
[Mettre à jour et sauvegarder](/fr/self-hosting/upgrade/).

## Pour aller plus loin

- [Vue d'ensemble](/fr/troubleshooting/overview/)
- [Support](/fr/troubleshooting/support/)
- [Issues GitHub](https://github.com/roleALPHA/good-workshop/issues)
