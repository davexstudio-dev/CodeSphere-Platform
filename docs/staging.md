# Staging

`https://staging.codesphereplatform.xyz` : Worker Cloudflare `codesphere-staging` (`wrangler --env staging`, `apps/web/wrangler.jsonc`) sur la branche Neon dont partent les previews. C'est aussi l'URL de production du proxy OAuth : la seule callback connue des fournisseurs d'identité ([#100](https://github.com/davexstudio-dev/CodeSphere-Platform/issues/100)).

Workflow : [`.github/workflows/staging.yml`](../.github/workflows/staging.yml) ([#106](https://github.com/davexstudio-dev/CodeSphere-Platform/issues/106)).

## Lancer un déploiement

Manuel uniquement, depuis `develop` :

```sh
gh workflow run staging.yml --ref develop
```

ou Actions › Staging › Run workflow, branche `develop`. Le bouton n'apparaît que si `staging.yml` est sur `main` (GitHub enregistre `workflow_dispatch` depuis la branche par défaut). Un push sur `develop` ne déploie pas.

Étapes : `gate` (le run `ci.yml` du commit doit être vert) → `database` (migrations et seed) et `build` (OpenNext, artefact) en parallèle → `deploy` (`wrangler deploy`, puis `GET /api/v1/health`).

## Variables (Settings › Secrets and variables › Actions › Variables)

| Nom | Rôle | Défaut |
| --- | --- | --- |
| `NEON_PROJECT_ID` | Projet Neon | requis |
| `NEON_PARENT_BRANCH` | Branche Neon de staging | `staging` |
| `EMAIL_FROM` | Expéditeur `Nom <adresse>` sur le domaine vérifié chez Resend | vide : e-mail désactivé |
| `X_CLIENT_ID` | Identifiant de l'application OAuth X (comptes sociaux, #266) | vide : X non connectable |
| `LINKEDIN_CLIENT_ID` | Identifiant de l'application OAuth LinkedIn | vide : LinkedIn non connectable |
| `LINKEDIN_API_VERSION` | Version mensuelle de l'API LinkedIn (AAAAMM) | `202609` |
| `LINKEDIN_AUTHOR` | `urn:li:organization:…` pour publier comme Page ; le membre connecté si vide | vide |
| `BLUESKY_IDENTIFIER` | Identifiant du compte Bluesky | vide : Bluesky désactivé |

## Secrets (environnement `preview`, partagé avec les previews)

| Nom | Rôle | Requis |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | `wrangler deploy` du Worker et de son domaine personnalisé | oui |
| `CLOUDFLARE_ACCOUNT_ID` | Compte Cloudflare | oui |
| `NEON_API_KEY` | Chaîne de connexion de la branche Neon | oui |
| `PREVIEW_BETTER_AUTH_SECRET` | `BETTER_AUTH_SECRET` du Worker | oui (le déploiement échoue sans) |
| `PREVIEW_OAUTH_PROXY_SECRET` | `OAUTH_PROXY_SECRET`, partagé staging/previews (proxy OAuth) | pour la connexion OAuth |
| `PREVIEW_GITHUB_CLIENT_ID`, `PREVIEW_GITHUB_CLIENT_SECRET` | App OAuth GitHub, callback sur l'URL de staging | pour « Se connecter avec GitHub » |
| `PREVIEW_GITLAB_CLIENT_ID`, `PREVIEW_GITLAB_CLIENT_SECRET` | Idem GitLab | optionnel |
| `PREVIEW_GOOGLE_CLIENT_ID`, `PREVIEW_GOOGLE_CLIENT_SECRET` | Idem Google | optionnel |
| `RESEND_API_KEY` | Envoi d'e-mails (staging seulement) | optionnel |
| `SOCIAL_CREDENTIALS_SECRET` | Secret (32 caractères ou plus, distinct du secret d'auth) dont dérive la clé de chiffrement des jetons des comptes sociaux. Le changer rend les comptes illisibles : on les reconnecte | pour les comptes sociaux |
| `X_CLIENT_SECRET`, `LINKEDIN_CLIENT_SECRET` | Secret des applications OAuth (X : client confidentiel seulement) | pour les comptes sociaux |
| `BLUESKY_APP_PASSWORD` | Mot de passe d'application Bluesky (jamais le mot de passe du compte) | pour Bluesky |
| `RESEND_WEBHOOK_SECRET` | Secret de signature du webhook Resend (`whsec_…`). Déclarer `https://<staging>/webhooks/resend` dans Resend, événements `email.bounced`, `email.suppressed`, `email.complained` (#200) | optionnel |

Les secrets passent au Worker par un fichier (`scripts/preview-secrets.mjs`), jamais par la ligne de commande ; une valeur absente est ignorée. Le workflow ajoute en `--var` : `BETTER_AUTH_URL`, `CORS_ORIGIN`, `OAUTH_PROXY_PRODUCTION_URL` (l'origine de staging), `EMAIL_OTP_SIGNIN=true`, `PUBLIC_SITE_URL` (l'origine de staging, base des liens publiés et de la callback OAuth) et `GIT_SHA`.

**Comptes sociaux.** Ils ne s'activent que si `SOCIAL_CREDENTIALS_SECRET`, `X_CLIENT_ID` ou `LINKEDIN_CLIENT_ID` sont définis ; une valeur absente est ignorée, rien n'est envoyé vide. L'application OAuth déclare `https://staging.codesphereplatform.xyz/admin/social/callback` comme URI de redirection, puis un Admin connecte le compte depuis `/admin/social`.

**Connexion par code e-mail.** Elle est active en staging : `EMAIL_OTP_SIGNIN=true` sur le Worker (`--var`) et `NEXT_PUBLIC_EMAIL_OTP_SIGNIN=true` au build, les deux doivent concorder (le second est inlined dans le bundle). Le code part par Resend : sans `RESEND_API_KEY` et `EMAIL_FROM`, la demande échoue avec « The sign-in code could not be sent. » (le code n'est journalisé qu'en développement). La production garde `EMAIL_OTP_SIGNIN=false`.

## Vérification `/api/v1/health`

Le job `deploy` attend jusqu'à 5 minutes un `200` sur `/api/v1/health`. Si Cloudflare Bot Fight Mode défie le runner GitHub (`403` + `cf-mitigated: challenge`), l'étape passe avec un avertissement : le Worker est joignable mais la santé n'est pas vérifiée.

Pour obtenir un vrai `200` depuis la CI, il faut que la zone ne défie plus les runners sur `staging.codesphereplatform.xyz` (réglage Cloudflare, hors dépôt) :

- Bot Fight Mode (offre gratuite) ne s'exempte pas par règle : le désactiver sur la zone ;
- ou, avec Super Bot Fight Mode, une règle WAF « Skip » sur `http.host eq "staging.codesphereplatform.xyz" and starts_with(http.request.uri.path, "/api/v1/health")`.

Vérification manuelle depuis un poste : `curl -i https://staging.codesphereplatform.xyz/api/v1/health` doit répondre `200` avec `{"status":"ok",...}`.
