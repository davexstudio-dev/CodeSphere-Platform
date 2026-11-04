# Checklist serveur

Spec §4 et §5, issue #54. À cocher par l'équipe sur le Cloud Server (Systalink, Dakar) et à versionner ici. Les cases cochées sont vérifiables dans le dépôt ; les autres demandent un accès au serveur.

## Réseau

- [ ] Pare-feu : seuls 22, 80 et 443 (et 443/udp) ouverts (`ufw status`)
- [x] Postgres non publié : aucun `ports` sur `postgres` (`docker-compose.prod.yml`)
- [ ] Postgres injoignable de l'extérieur, vérifié depuis une autre machine : `nc -zv <ip> 5432` échoue
- [x] Seul Caddy publie des ports (80, 443)

## Accès

- [ ] SSH par clé seulement (`PasswordAuthentication no`, `PermitRootLogin no`)
- [ ] Utilisateur `deploy` sans sudo, membre du groupe `docker`
- [ ] `fail2ban` ou équivalent actif sur SSH
- [ ] Mises à jour de sécurité automatiques (`unattended-upgrades`)

## Application

- [x] Conteneurs non root (`USER bun` dans `apps/*/Dockerfile`), images multi-étapes
- [x] En-têtes de sécurité et CSP (`deploy/Caddyfile`, `apps/web/src/proxy.ts`)
- [ ] Fichiers `.env` en `chmod 600`, absents du dépôt (gitleaks en CI)
- [ ] `ADMIN_EMAILS` limité aux comptes de l'équipe
- [ ] Console du navigateur sans erreur CSP sur les parcours de démo, en production

## Sauvegarde et supervision

- [x] Sauvegarde nocturne 7 jours + copie R2 chiffrée (`deploy/backup.sh`)
- [ ] `crontab` de `deploy` installée (sauvegarde, `monitor.sh`)
- [ ] Heartbeat healthchecks.io reçu
- [ ] UptimeRobot sur `/api/v1/health`, alertes Telegram et email reçues une fois
- [ ] **Restauration testée avant le 24 oct.** : dump rapatrié de R2, `pg_restore` dans une base vide, application démarrée dessus (date et auteur : ……)

## Conformité

- [ ] Déclaration CDP Sénégal
- [ ] Conditions de traitement Systalink acceptées
