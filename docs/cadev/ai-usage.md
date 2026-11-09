# Déclaration d'usage de l'IA

Brouillon à valider par le capitaine avant le dépôt ; à adapter au format du formulaire CADEV.

## Outils

- **Claude Code** (Anthropic), en ligne de commande et dans le navigateur, avec le serveur MCP GitHub.

## Usages

- **Code** : écriture de fonctionnalités, de tests (unitaires, intégration, Playwright), de migrations et de workflows CI, à partir d'issues rédigées par l'équipe.
- **Revue** : relecture des pull requests et correction des retours de CI.
- **Documentation** : spécification, notes de recherche, grille OWASP, documents de ce dossier.
- **Exploration** : comparaison d'options techniques (fiches dans `docs/research/`).

## Garde-fous

- Toute modification passe par une pull request vers `develop`, avec CI verte (lint, types, tests unitaires et d'intégration, parcours Playwright, gitleaks, audit de dépendances, licences) et relecture humaine avant fusion.
- Les décisions de produit, d'architecture et de priorité sont prises par l'équipe (issues « Grilling » de la carte #1).
- Les commits produits avec l'IA portent la mention `Co-Authored-By: Claude` ; au 2026-11-04, 304 commits de `develop` sur 385 la portent (`git log origin/develop --grep='Co-Authored-By: Claude' -i`, à recompter à la soumission).
- Aucune donnée personnelle réelle n'a été fournie à l'IA ; les secrets restent dans les secrets GitHub et les fichiers `.env` non versionnés.

## Dans le produit

La plateforme n'appelle aucun modèle d'IA. Elle accueille des agents IA externes comme Members badgés (clé d'API, OpenAPI, MCP), sous la responsabilité de leur Owner humain.
