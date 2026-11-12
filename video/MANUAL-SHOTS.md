# Plans à filmer à la main (#358)

> **Mise à jour du 12 nov.** : ces plans sont maintenant produits par `scripts/record-signin.mjs` et `scripts/record-agent.mjs` (voir le [README](README.md)). Ce guide reste utile pour un tournage manuel (OBS), par exemple pour remplacer le terminal reconstitué du plan `agent` par un vrai terminal.

`scripts/record.mjs` filme les plans publics ou simples (`problem`, `topics`, `ask`, `cadev`). Les quatre plans ci-dessous demandent un geste humain ou plusieurs fenêtres : à filmer avec OBS (format et règles dans [`docs/cadev/video-storyboard.md`](../docs/cadev/video-storyboard.md)).

**Règles communes**

- Filmer le **staging** (`https://staging.codesphereplatform.xyz`), contenu de démonstration chargé, compte et agent **de démo**.
- Aucune vraie adresse e-mail à l'écran. **Aucune clé d'API lisible** : la masquer ou la flouter.
- Sortie : `public/clips/<plan>.mp4`, **1920×1080**, 30 i/s, sans son (la voix vient des MP3). Puis renseigner `clip: "<plan>.mp4"` du plan dans `src/data.ts`.
- Filmer **un peu plus long** que la durée du plan : le rendu coupe, il ne rallonge pas.
- Ne rien publier de réel : la question de démo reste en brouillon, ou est supprimée après la prise.

## `signin` (20 s, plan 3)

À l'écran : la connexion en un clic, puis le fil réglé sur les Tags.

1. Déconnecté, ouvrir `/signin`. La fenêtre doit montrer toute la page (Ctrl+– si besoin) : le panneau de marque à gauche, la carte à droite.
2. Cocher les conditions, puis « Continuer avec GitHub » (compte de démo). Laisser passer la redirection.
3. Au choix des Tags, sélectionner `mobile-money` et `ussd`, puis valider.
4. Finir sur le fil « Pour toi », immobile 2 s.

Incrustation : « SSO GitHub · GitLab · Google ».

## `agent` (30 s, plan 5)

À l'écran : écran partagé, **terminal MCP à gauche, Question à droite**, la réponse de l'agent apparaît.

1. Préparer une Question de démo sur `mobile-money`, ouverte dans le navigateur à droite.
2. Terminal à gauche, avec la clé de l'agent de démo **dans une variable d'environnement** (jamais affichée) : une commande MCP qui répond à la Question.
3. Lancer la commande, puis actualiser ou attendre l'arrivée de la réponse badgée « agent de … ».
4. Garder la réponse visible 3 s.

À vérifier avant de filmer : la réponse de l'agent est bien badgée, et l'agent n'a aucun bouton de vote. Ne pas montrer le repli des réponses d'agent : c'est *prévu*, pas livré.

## `badge` (10 s, plan 6)

À l'écran : le badge « agent de … » et le clic sur **Accepter**.

1. Sur la Question du plan précédent, zoomer sur le badge de la réponse (gros plan, Ctrl+ ou zoom OBS).
2. Cliquer sur « Accepter » (compte auteur de la Question).
3. Laisser l'état « acceptée » 2 s.

## `offline` (30 s, plan 7)

À l'écran : passage hors ligne, envoi en file, retour du réseau, envoi automatique.

1. Ouvrir une Question de démo, DevTools → Réseau → **Hors ligne** (la coupure est réelle, pas simulée à l'écran).
2. Rédiger une réponse et l'envoyer : le message « en attente » doit apparaître.
3. Repasser en **En ligne** : la réponse part seule, le message disparaît.
4. Si la réponse est réellement publiée, la supprimer ensuite depuis le compte de démo.

Incrustation : « Local-first ».

## Coupe 9:16

Les plans `problem`, `agent`, `offline` et `outro` de la coupe veulent des clips **1080×1920**. Refaire les mêmes gestes avec une fenêtre au format téléphone (DevTools, mode appareil), ou laisser la carte de remplacement.
