# Déploiement de CodeSphere (pile de production)

Une pile Docker Compose sur le Cloud Server Systalink (Dakar) : Caddy (HTTPS, deux hôtes), le web, le serveur, PostgreSQL 18. Le serveur héberge **la production seule** ; la préproduction et les previews restent sur Cloudflare Workers (décisions de #168).

## Fichiers

- `../docker-compose.prod.yml` : la pile (caddy, web, migrate, server, postgres). Seul Caddy publie des ports (80, 443). Les images web et server viennent de GHCR (`SERVER_IMAGE`, `WEB_IMAGE`), construites par la CI ; en local, le même fichier les construit.
- `deploy.sh <sha> <version>` : lancé par le workflow Release. Tire les images du commit, fait un dump de la base (sauf au premier déploiement), puis `up -d --no-build --wait` : la migration passe avant le serveur, et le déploiement échoue si un conteneur n'est pas sain. Un échec de pull ou de dump ne touche pas aux conteneurs en service. Trace chaque déploiement dans `deploy/deployed.log`.
- `Caddyfile` : deux hôtes, un site. L'hôte public redirige `/admin` vers l'hôte d'administration ; chaque hôte envoie ses chemins d'API (`/api`, `/rpc`, `/mcp`) au serveur et le reste au web.
- `backup.sh` : dump PostgreSQL (format custom, 7 jours), copie hors serveur `rclone` optionnelle, puis signal healthchecks.io. Lit ses réglages dans `.env`. Chaque nuit par `cron`, et avant chaque migration par `deploy.sh` (sans signal).
- `monitor.sh` : alerte Telegram si le disque dépasse 80 % ou la mémoire 90 %. Toutes les 15 min par `cron`, configuré par `.env.monitor` (modèle `.env.monitor.example`).
- `../.github/workflows/production.yml` : le workflow **Release** (voir plus bas).
- `../.github/release.yml` : catégories des notes de Release GitHub.

## Variables

Dans `.env` à côté de `docker-compose.prod.yml` (jamais commité, modèle `../.env.prod.example`) :

| Variable | Rôle |
|---|---|
| `PUBLIC_HOST` | hôte public, aussi domaine du cookie de session (ex. `codesphereplatform.xyz`) |
| `ADMIN_HOST` | hôte d'administration (ex. `admin.codesphereplatform.xyz`) |
| `ACME_EMAIL` | contact Let's Encrypt |
| `POSTGRES_PASSWORD` | mot de passe de la base (obligatoire) |
| `BACKUP_HEARTBEAT_URL`, `OFFSITE_REMOTE` | signal healthchecks.io et copie hors serveur de `backup.sh` |

Plus `apps/server/.env` (secrets, identifiants SSO) et `apps/web/.env` (valeurs publiques seulement ; ne pas y mettre `NEXT_PUBLIC_SERVER_URL` : l'image web appelle l'API en même origine).

`APP_VERSION`, `GIT_SHA`, `SERVER_IMAGE` et `WEB_IMAGE` sont fixés par `deploy.sh` à chaque déploiement. `backup.sh` lit aussi `BACKUP_DIR` et `KEEP_DAYS` (7).

En production, le workflow écrit ces trois fichiers (`chmod 600`) à chaque déploiement, depuis les secrets de l'environnement GitHub `production` : rien n'est à éditer à la main sur le serveur.

## Mise en place (une fois, par un membre de l'équipe)

1. Commander le Cloud Server (Business, Dakar, Linux) sur platform.systalink.com et appliquer le code promo CADEV (art. 9, -40 %). L'éligibilité à l'art. 6 est demandée à l'organisateur (#169).
2. Acheter le domaine ; créer les enregistrements DNS `A` de `PUBLIC_HOST` et `ADMIN_HOST` vers l'IP du serveur, en DNS seul (pas de proxy Cloudflare, #168).
3. Sur le serveur : `DEPLOY_PUBKEY="ssh-ed25519 …" bash prepare-server.sh` en root (installe Docker et Compose, crée l'utilisateur `deploy` sans sudo avec la clé publique du déploiement, n'ouvre que les ports 22, 80 et 443 et affiche l'empreinte de l'étape 4). Clé à générer en local : `ssh-keygen -t ed25519 -N '' -C codesphere-deploy -f deploy_key`.
4. Relever l'empreinte de la clé d'hôte : `ssh-keyscan -t ed25519 <IP> | ssh-keygen -lf -` (la valeur `SHA256:…`).
5. Dans GitHub, **Settings > Environments > `production`** : reviewers requis (capitaine et @lamafx), branche `main` seule ; puis les secrets et la variable ci-dessous.
6. Lancer le premier déploiement (section suivante) et vérifier `https://<PUBLIC_HOST>/api/v1/ready`.

### Environnement GitHub `production`

| Nom | Type | Contenu |
|---|---|---|
| `PROD_PUBLIC_HOST` | variable | hôte public, ex. `codesphereplatform.xyz` (contrôles HTTPS du workflow) |
| `DEPLOY_HOST` | secret | IP ou nom du serveur |
| `DEPLOY_SSH_KEY` | secret | clé privée de l'utilisateur `deploy` (ed25519, propre à ce déploiement) |
| `DEPLOY_HOST_FINGERPRINT` | secret | empreinte `SHA256:…` de l'étape 4 : le workflow refuse un autre serveur |
| `PROD_COMPOSE_ENV` | secret | contenu de `.env` (modèle `../.env.prod.example`) |
| `PROD_SERVER_ENV` | secret | contenu de `apps/server/.env` (secrets, identifiants SSO, Resend ; modèle `prod.server.env.example`) |
| `PROD_WEB_ENV` | secret | contenu de `apps/web/.env` (valeurs publiques seulement) |

Au niveau du dépôt (**Settings > Secrets and variables > Actions**), pour tirer sur le serveur les images publiées sous `ghcr.io/davexstudio-dev` :

| Nom | Type | Contenu |
|---|---|---|
| `GHCR_USERNAME` | variable | le compte membre de l'organisation davexstudio-dev qui détient le jeton |
| `GHCR_TOKEN` | secret | jeton de ce compte (classique, `read:packages`) : il tire les images sur le serveur |

Les images sont publiées sous le propriétaire du dépôt (davexstudio-dev) : le build les pousse avec le jeton de la run (`packages: write`), sans secret. Le jeton dédié ne sert qu'au `pull` sur le serveur, où le jeton de la run n'existe pas ; il est retiré (`docker logout`) juste après.

## Release (déploiement de production)

Workflow **Release** (`../.github/workflows/production.yml`), manuel : **Actions > Release > Run workflow**, branche `main`, avec la version (`gh workflow run production.yml --ref main -f version=v1.0.0`).

| Étape | Ce qui est vérifié | En cas d'échec |
|---|---|---|
| CI passed | branche `main`, version `vX.Y.Z` nouvelle, CI et licences vertes sur le commit | rien ne démarre |
| Build | images web et server construites une fois, poussées sur `ghcr.io/davexstudio-dev` (étiquette = commit) | pas de déploiement |
| E2E | les parcours Playwright sur une pile locale | pas de déploiement |
| Deploy production | approbation des reviewers, puis `deploy.sh` en SSH, puis HTTPS : `/api/v1/ready` à 200 et `/api/v1/health` qui rapporte ce commit | la production reste sur la version précédente si le pull ou le dump échoue |
| GitHub Release | étiquette `vX.Y.Z` et notes, seulement une fois la production sur le commit | — |

Les pull requests qui touchent la pile (Dockerfiles, `docker-compose.prod.yml`, `deploy/`, le workflow) construisent les images sans les pousser : un Dockerfile cassé se voit avant la fusion.

**Rollback** : revenir sur `main` (revert) puis publier une nouvelle version. Les changements de schéma restent compatibles sur deux releases (#168) ; le dump pris avant la migration est dans `backups/`. En urgence, depuis le serveur, `deploy/deploy.sh <sha> <version>` relance une version déjà publiée sur GHCR (avec `REGISTRY=ghcr.io/davexstudio-dev`, après `docker login ghcr.io` avec un jeton `read:packages`).

## Supervision

- **Telegram** : créer un groupe d'équipe et un bot (@BotFather), l'y ajouter ; renseigner `deploy/.env.monitor` (`chmod 600`).
- **healthchecks.io** : un contrôle, période 1 jour, tolérance 2 h, alertes Telegram et e-mail ; son URL de ping va dans `BACKUP_HEARTBEAT_URL`.
- **UptimeRobot** : sonde HTTP toutes les 5 min sur `https://<PUBLIC_HOST>/api/v1/health`, alertes Telegram et e-mail.
- **Copie hors serveur** : bucket Cloudflare R2 et une clé d'API limitée à ce bucket ; `rclone` (MIT), un remote `r2` (S3, fournisseur Cloudflare) puis un remote `crypt` par-dessus ; mots de passe conservés hors serveur. `OFFSITE_REMOTE=<remote>:`. Tester une restauration depuis R2 au moins une fois.
- **`crontab -e`** de `deploy` :

  ```
  */15 * * * * ~/codesphere/deploy/monitor.sh
  17 3 * * *   cd ~/codesphere && deploy/backup.sh >> backups/backup.log 2>&1
  ```

## Avant la démo CADEV (24 oct., début du gel)

Faire une sauvegarde, vérifier sa présence sur R2, en rapatrier une copie et la restaurer dans une base locale (`pg_restore`, voir l'en-tête de `backup.sh`) pour s'assurer qu'elle est exploitable.

## Logs

Rotation par Docker (`json-file`, 5 fichiers de 10 Mo par conteneur). En SSH : `docker compose -f docker-compose.prod.yml logs -f --since 1h server`.

## Vérifications

- Vérifié en local (Docker, registre local, images factices) : `deploy.sh` au premier déploiement puis au suivant (dump avant migration, sans signal healthchecks.io), Caddy (redirection `/admin`, en-têtes), `up --wait` qui échoue si la migration échoue, et un déploiement raté qui laisse la version précédente en service.
- Non vérifié : le build des images réelles (le job Build des pull requests le prouve en CI), `drizzle-kit migrate` dans l'image server, la copie `rclone`, et les spécificités de la VM Systalink (image Linux, pare-feu, accès root initial).
