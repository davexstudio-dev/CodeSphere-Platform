# OAuth : URL de rappel des previews (GitHub, GitLab, Google) et plugin oAuthProxy de Better Auth

Ticket : davexstudio-dev/CodeSphere-Platform#99 (parent #86). Rédigé le 2026-10-11.
Version de Better Auth du dépôt : `better-auth` 1.7.5 (`package.json` racine ; `@better-auth/*` 1.7.5 dans `packages/auth`).

## Réponse courte

1. **Aucun des trois fournisseurs n'accepte un joker `*.preview.codesphereplatform.xyz` comme URL de rappel utilisable.** Google l'interdit explicitement ; GitLab compare en chaîne exacte (via Doorkeeper) ; GitHub n'a pas de motif à joker, mais sa « correspondance par sous-domaine » (opt-in) accepte n'importe quel sous-domaine de l'hôte enregistré, avec un risque documenté.
2. **Le plugin `oAuthProxy` est la solution prévue** : une seule URL de rappel enregistrée (la production) ; les previews délèguent l'échange du code à la production et reçoivent le profil chiffré. Le secret partagé est le point sensible.
3. **Google** : le mode « Testing » plafonne à 100 utilisateurs de test ; pour `openid email profile` seuls, les autorisations n'expirent pas et aucune liste de test n'est requise (détails et réserves plus bas).

## 1. Règles de correspondance des URL de rappel

### GitHub (OAuth Apps)
Source : https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps

- Correspondance générique désactivée : « the redirect URL must exactly match the callback URL ».
- Activée : l'hôte (« excluding subdomains ») et le port doivent correspondre exactement ; les sous-domaines de l'hôte enregistré sont acceptés ; le chemin doit être un sous-répertoire du chemin enregistré.
- Exemple de la doc : avec `https://example.com/path`, `https://oauth.example.com/path/subdir/other` correspond ; `https://example.com:8080/path` et `https://example.org` non.
- Avertissement de la doc : un attaquant peut recevoir des codes sur n'importe quel sous-domaine ou sous-répertoire ; à n'activer que si on les contrôle tous.
- `redirect_uri` omis : redirection vers la première URL de rappel configurée.
- Boucle locale (`http://127.0.0.1`) : le port n'a pas à correspondre.
- Applications à URL unique avant le 3 août 2026 : correspondance générique activée sur cette URL (la doc recommande de la désactiver si inutile).
- Non précisé par la page : nombre maximal d'URL de rappel ; règle exacte avec plusieurs URL.

Conséquence : `*.preview.codesphereplatform.xyz` ne s'exprime pas en motif. Enregistrer un domaine parent avec la correspondance générique activée couvrirait les sous-domaines, mais élargit la surface d'attaque. Inutile avec oAuthProxy.

### GitLab
Sources : https://docs.gitlab.com/api/oauth2/ ; https://docs.gitlab.com/integration/oauth_provider/ ; Doorkeeper `lib/doorkeeper/oauth/helpers/uri_checker.rb` (https://github.com/doorkeeper-gem/doorkeeper), bibliothèque sur laquelle repose le fournisseur OAuth de GitLab.

- Doc GitLab : le `redirect_uri` doit correspondre à celui de la requête d'autorisation initiale ; HTTPS recommandé en production (HTTP toléré).
- La doc GitLab **ne documente pas** les jokers, le nombre maximal d'URL ni les ports (lacune).
- Doorkeeper : `matches?` compare par « simple string comparison » (RFC 6749 §3.1.2.3) ; seule exception, le port d'une URI de boucle locale (RFC 8252 §7.3). Les URI enregistrées sont séparées par des blancs/retours à la ligne. Aucun joker.
- Inférence (non écrite dans la doc GitLab) : correspondance exacte, pas de joker.

### Google
Sources : https://developers.google.com/identity/protocols/oauth2/web-server (règles de validation des URI de redirection) ; https://support.google.com/cloud/answer/6158849

- Caractères interdits : « Wildcard characters ('*') » (entre autres).
- HTTPS obligatoire (sauf localhost) ; pas d'IP brute (sauf localhost) ; le TLD doit figurer dans la Public Suffix List ; pas de userinfo, pas de traversée de chemin, pas de fragment, pas de redirection ouverte.
- Non précisé par les pages lues : nombre maximal d'URI par client. Les modifications peuvent prendre « 5 minutes to a few hours ».

## 2. Plugin `oAuthProxy` de Better Auth

Sources : https://better-auth.com/docs/plugins/oauth-proxy ; code `packages/better-auth/src/plugins/oauth-proxy/index.ts` au tag `v1.7.5` (https://github.com/better-auth/better-auth).

### Fonctionnement
- La preview démarre l'OAuth mais utilise l'URI de rappel de la production. Le fournisseur rappelle la production, qui échange le code et récupère le profil, le chiffre et redirige vers la preview ; celle-ci le déchiffre et crée utilisateur et session dans sa propre base. La production n'écrit rien en base pendant ce flux.
- Code : hook `before /sign-in/social` (réécrit `redirect_uri` vers `productionURL` et le `callbackURL` vers `<preview>/api/auth/callback/<provider>/oauth-proxy?callbackURL=...`) ; hook `after /sign-in/social` (réencapsule le `state` avec la clé du proxy) ; hook `before /callback/:id` côté production (déchiffre le `state`, échange le code, produit la charge `profile` chiffrée) ; endpoint `/callback/:id/oauth-proxy` côté preview (déchiffre, valide par schéma Zod, pose le cookie de session).

### Configuration
- `productionURL` : origine stable de la production ; défaut `BETTER_AUTH_URL` puis `baseURL`. Les requêtes depuis cette origine ne sont pas proxifiées.
- `currentURL` : inféré (URL de requête, variables d'hébergeur, `baseURL`) ; à fixer seulement si l'inférence échoue.
- `secret` : clé dédiée au flux, remplace `BETTER_AUTH_SECRET` pour ce flux ; **identique dans tous les environnements participants**, sinon `state_mismatch`.
- `maxAge` : défaut 60 s (code : `opts?.maxAge ?? 60`) ; charge rejetée si `age > maxAge` ou `age < -10` (`payload_expired`). La doc suggère 30 à 60 s.
- `cookieMaxAge` : non documenté sur la page lue.
- Ajouter les origines preview/localhost à `trustedOrigins`.
- Mise à jour : même `productionURL` et même `secret`, mêmes versions de Better Auth partout, bascule simultanée.

### Risques de sécurité
- Doc : « Anyone holding this secret can assert provider identities through the proxy. » Ne pas exposer le secret aux déploiements preview exécutant du code de contributeur non fiable. Un secret dédié ne limite pas ce que peut faire son détenteur.
- Redirection ouverte (lecture du code 1.7.5) : l'endpoint de complétion passe le `callbackURL` de la requête par `originCheck`, mais la cible finale (`payload.callbackURL` / `newUserURL`) vient de la charge chiffrée et n'est pas revérifiée contre `trustedOrigins` dans ce fichier. Un détenteur du secret peut donc forger une charge : le risque repose sur la confidentialité du secret et sur `maxAge`.
- Rejeu : limité par `maxAge` ; aucun nonce à usage unique observé dans ce fichier.
- Fuite : la charge transite en paramètre de requête `profile` (journaux, historique), chiffrée, et contient les jetons du fournisseur. Le cookie de session est posé par la preview sur son propre domaine.
- Garde-fou : le hook `after /callback/:id` ne déballe la redirection que si elle est de même origine que la production ; sinon il journalise un avertissement.

### Compatibilité
- Fournisseurs : le plugin ne dépend pas du fournisseur ; seule l'URL de production est enregistrée (`https://<prod>/api/auth/callback/<provider>`), compatible avec les règles exactes de GitHub, GitLab et Google. Aucun test réel n'a été exécuté (recherche documentaire).
- Origine unique Cloudflare : compatible en principe (la production reste l'unique origine de rappel ; `productionURL` doit être cette origine publique). À valider à l'implémentation (#100) : `currentURL` inféré derrière Cloudflare, et `trustedOrigins` pour les previews.

## 3. Google : écran de consentement « Testing » vs « In production »

Sources : https://support.google.com/cloud/answer/15549945 ; https://support.google.com/cloud/answer/13463073

- Testing : jusqu'à 100 utilisateurs de test listés ; les autorisations d'un utilisateur de test expirent après 7 jours, jetons d'actualisation compris.
- In production : disponible à tout compte Google ; la vérification peut s'appliquer selon les scopes.
- Scopes de base `openid email profile` seuls : exemption de la liste d'utilisateurs de test (pas d'ajout nécessaire, pas d'avertissement) et pas d'expiration à 7 jours. L'exemption disparaît si un autre scope est demandé.
- Vérification : obligatoire pour les scopes sensibles/restreints ; pour les scopes non sensibles elle est facultative (« not mandatory »), seule la vérification de marque (nom/logo) existe.
- Plafond des apps non vérifiées : 100 nouveaux utilisateurs sur toute la vie du projet, non réinitialisable ; la page ne dit pas explicitement comment il s'applique aux apps limitées aux scopes de base : à vérifier dans la console avant le lancement.

## Limites de cette recherche
- Pages récupérées via un outil qui les résume ; les règles de publication Google ne figuraient pas sur `answer/6158849` ni `answer/13463073`, d'où `answer/15549945`.
- La doc GitLab ne documente pas la correspondance ; déduite du code Doorkeeper.
- Code du plugin lu au tag v1.7.5 ; `checkSkipProxy` (dans `./utils`) non examiné.
