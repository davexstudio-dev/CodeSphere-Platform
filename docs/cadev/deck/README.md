# Diapositives du pitch CADEV (#358)

Source unique des 8 diapositives, en **français et en anglais** : [`slides.mjs`](slides.mjs). Le texte suit [`../pitch-deck.md`](../pitch-deck.md) ; en cas d'écart, corriger les deux.

```bash
cd docs/cadev/deck
node build.mjs            # out/deck.{fr,en}.html + out/codesphere-pitch.{fr,en}.pdf (1920x1080)
node build.mjs --no-pdf   # HTML seul
```

Charte : jetons de `packages/ui/src/styles/globals.css` (terracotta, fonds chauds), police Outfit (OFL) intégrée depuis `assets/fonts/`. `node build.mjs --light` produit la variante crème (`*.light.*`).

Chrome vient de Playwright (`apps/e2e`), de `CHROME_PATH` ou du Chrome installé. Aucune dépendance ajoutée.

## Avant de figer (13 nov.)

- Le build liste ce qui reste : les champs jaunes `[à relever]` (chiffres du tableau de bord de la production, relevés le 12 nov.), le recomptage des commits IA, et les captures manquantes.
- **Captures** : déposer dans `assets/` les PNG nommés dans `slides.mjs` (`home-feed`, `for-you`, `agent-answer`, `ask`, `contract`, `dashboard`). Prises sur le staging avec le contenu de démonstration signalé ; aucune vraie adresse e-mail ni clé à l'écran.
- Ne jamais remplacer un champ `[à relever]` par un chiffre non relevé.
- Les PDF sont générés, pas committés (`out/`). Joindre le PDF anglais au dépôt.
