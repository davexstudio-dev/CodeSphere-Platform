# Livrables CADEV 2026

Issue #167, carte #1. Dépôt le **25 oct. 2026 avant 17h00 GMT** (cible interne : samedi 24). Le thème et le formulaire de rendu ne sont pas publiés : ces documents sont des **brouillons**, à ajuster dès leur publication.

| Livrable | Document | État | Qui |
|---|---|---|---|
| Démo (3 min) | [demo-script.md](demo-script.md) | brouillon | équipe, répétition le 23 oct. (#57) |
| Pitch (le dossier de soumission en tient lieu) | [pitch.md](pitch.md) | stratégie décidée (#235), à rédiger | @lamafx |
| Vidéo (maîtresse 16:9 de 3 min, coupe 9:16 de 60 s) | [video-storyboard.md](video-storyboard.md) | stratégie décidée (#236), tournage à faire | @lamafx |
| Feuille de route | [../roadmap.md](../roadmap.md) | brouillon, trimestres cibles à fixer | capitaine |
| Vote public (27 au 30 oct.) | décisions dans le ticket #237 | kit de relais, relais et responsable à désigner | à désigner |
| Repo public | `LICENSE` (MIT), [README](../../README.md), historique scanné par gitleaks | prêt côté code ; rendre le dépôt public reste une action humaine | capitaine |
| Déclaration d'usage de l'IA | [ai-usage.md](ai-usage.md) | brouillon à valider | capitaine |
| Déclaration d'auteur | [author-declaration.md](author-declaration.md) | modèle, une signature par membre | chaque membre |
| Composants tiers et licences | [third-party-licenses.md](third-party-licenses.md) | généré le 2026-10-15 ; à régénérer à la soumission | `bun run licenses -- --out=docs/cadev/third-party-licenses.md` |
| Politique de confidentialité | `/legal/privacy` (PR #191) | publiée | — |
| Déploiement sur Systalink | #35, #169 | bloqué : Cloud Server acheté mais en maintenance, identifiants inaccessibles au 17 oct. ; le règlement exige un déploiement sur Datacloud avant la limite | capitaine |

## Points à ne pas oublier

- **MPL-2.0** : `lightningcss` (outil de build CSS) est sous MPL-2.0, acceptée par l'organisateur à condition de la **déclarer dans la partie « technologies »** à la création du projet.
- **Inscription Datacloud** (étape distincte) : pays de représentation de l'équipe (définitif, art. 4), représentant unique, clé de répartition du prix.
- **Vote entre participants** du même pays, 25 oct. 18h – 26 oct. 23h59 : **obligatoire** pour que la soumission compte.
- **Gel des fonctionnalités** le 22 au soir : seulement des `fix/*` ensuite.
- Avant de rendre le dépôt public : `bunx gitleaks detect --log-opts="--all"` sur un clone complet (fait le 2026-10-15 : 173 commits, aucune fuite ; la clé factice de `/design-system` est dans `.gitleaksignore`).
