# Premier déploiement sur Systalink : état et actions restantes (#35, #41)

> **Périmé depuis le 2026-11-06** : la production est en ligne sur Systalink (#35 fermée, v0.9.1 le 2026-11-09). Ce relevé du 2026-11-04 n'est gardé qu'à titre d'historique.

Relevé du **2026-11-04**, depuis l'extérieur, sans accès SSH (aucun identifiant utilisé).

## Constat

| Contrôle | Résultat |
|---|---|
| `https://staging.codesphereplatform.xyz/api/v1/health` et `/ready` | 200. Résolu vers des IP Cloudflare : c'est le staging sur **Workers**, pas le serveur Systalink. |
| `codesphereplatform.xyz` et `admin.codesphereplatform.xyz` | DNS déjà pointés vers **94.237.56.14**, sans proxy Cloudflare (conforme à #168). |
| 94.237.56.14, port 22 | **ouvert** : le serveur répond, le SSH écoute. |
| 94.237.56.14, ports 80 et 443 | **fermés ou filtrés** : Caddy ne tourne pas, rien n'est déployé. Pare-feu de la VM possible, à vérifier. |
| `https://codesphereplatform.xyz/api/v1/health` | pas de réponse. Le critère de #35 (l'URL publique répond) n'est donc pas rempli. |
| `origin/main` contre `origin/develop` | `main` a 4 commits de fusion que `develop` n'a pas, `develop` en a 123 que `main` n'a pas. La release part de `main` : sans fusion `develop` vers `main`, elle n'embarque pas le travail récent. |

Le critère 1 de #41 (`staging.codesphereplatform.xyz` en HTTPS) est rempli par le staging Workers. Il ne prouve rien sur le serveur Systalink.

L'état « en maintenance, identifiants inaccessibles » (17 oct.) est peut-être dépassé : à vérifier par un membre qui a accès à platform.systalink.com.

## Actions humaines, dans l'ordre

1. **Accès** : retrouver l'IP (probablement 94.237.56.14, à confirmer dans la console Systalink) et un accès root par clé SSH.
2. **Pare-feu** de la VM : ouvrir 80 et 443 (Caddy), garder 22.
3. **Préparer le serveur** : `deploy/prepare-server.sh` en root (jamais exécuté, prévoir un premier échec), relever l'empreinte SSH, générer la clé de déploiement.
4. **Environnement GitHub `production`** (reviewers : capitaine et @lamafx, branche `main` seule). Variables et secrets : `DEPLOY_HOST`, `DEPLOY_SSH_KEY`, `DEPLOY_HOST_FINGERPRINT`, `PROD_COMPOSE_ENV`, `PROD_SERVER_ENV`, `PROD_WEB_ENV`, `PROD_PUBLIC_HOST`, puis `GHCR_USERNAME` et `GHCR_TOKEN` au niveau du dépôt (détail : `deploy/README.md`).
5. **URL de rappel SSO** (GitHub, GitLab, Google) pour le domaine de production.
6. **PR `develop` vers `main`**, puis fusion.
7. **Release de répétition** : `gh workflow run production.yml --ref main -f version=v0.9.0`, approbation des reviewers, puis `https://codesphereplatform.xyz/api/v1/ready` et `/health` (la version et le SHA doivent correspondre). Garder `v1.0.0` pour la soumission.
8. **Supervision (#41)** : Telegram (bot et groupe, `deploy/.env.monitor`), UptimeRobot sur `/api/v1/health`, healthchecks.io (`BACKUP_HEARTBEAT_URL`), bucket R2 et remote `rclone` chiffré, `crontab` de `deploy/README.md`.
9. **Test d'alerte** : `DISK_MAX=1 deploy/monitor.sh` doit envoyer un message dans le groupe Telegram.
10. **Sauvegarde** : `deploy/backup.sh`, vérifier la présence sur R2, rapatrier une copie et la restaurer dans une base locale.
11. **Fermer #35** quand l'URL publique répond : noter l'URL, l'emplacement des secrets et les écarts dans la réponse.

## Risques

- `prepare-server.sh` et le workflow Release n'ont **jamais tourné** sur un vrai serveur.
- Le premier déploiement ne fait pas de dump de base (voulu) : aucun filet.
- Les deux reviewers doivent être disponibles pour approuver la release.
- Si l'accès n'est pas rétabli à temps, repli sur Workers et Neon (#233) : le dossier ne doit alors pas dire « hébergé chez Systalink » (#235). L'achat d'un produit Datacloud reste obligatoire (art. 6).
- `deploy/README.md` parle encore de « la démo CADEV (24 oct., début du gel) » : date caduque, à aligner sur [submission-checklist.md](submission-checklist.md).
