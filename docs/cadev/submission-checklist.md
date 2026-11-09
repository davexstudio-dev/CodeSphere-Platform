# Check-list de soumission CADEV

Issue #58. Brouillon du 2026-11-04. Les dates viennent de `docs/research/cadev-update-2026-10-19.md` : dépôt le **15 nov. 2026 avant 17h00 GMT** (l'heure est supposée inchangée), vote des pairs du 15 nov. 18h au 16 nov. 23h59, vote du public du 17 au 20 nov., jury le 22 nov. Les trois derniers sont décalés de 21 jours en attendant le calendrier officiel : **à confirmer**.

Les dates intermédiaires ci-dessous sont une **proposition** (la soumission seule est imposée par le règlement). Les anciennes dates internes (gel le 24 oct., tournage les 20 et 23 oct.) sont caduques.

## Calendrier proposé

| Date | Étape | Responsable |
|---|---|---|
| 5 au 8 nov. | Décision d'hébergement de la production : Systalink (#35) ou repli Workers + Neon (#233). Dossier, pitch et vidéo ne disent « hébergé chez Systalink » que si c'est vrai (#235). | capitaine |
| 8 nov. | Gel des fonctionnalités : ensuite seulement des `fix/*`. | équipe |
| 9 nov. | Tournage complet de la vidéo sur l'URL réelle (#236). Répétition générale du scénario de [demo-script.md](demo-script.md) (#57). | @lamafx + équipe |
| 11 nov. | Montage final, sous-titres relus, aucune donnée personnelle à l'écran. | @lamafx |
| 12 nov. | Régénérer `third-party-licenses.md`, recompter les commits IA dans `ai-usage.md`, relever les chiffres du tableau de bord pour le pitch. | membre « doc » |
| 13 nov. | Déclarations d'auteur signées par les 4 membres. Dépôt rendu public après un gitleaks complet. | chaque membre, capitaine |
| 14 nov. | Release `v1.0.0` (voir plus bas). Soumission à blanc du formulaire si la plateforme le permet. | capitaine |
| 15 nov. avant 17h00 GMT | **Soumission.** Conserver l'accusé de réception. | capitaine |
| 15 nov. 18h au 16 nov. 23h59 | Vote des pairs : obligatoire pour que la soumission compte. | les 3 membres (à confirmer) |

## Contenu du dossier

- [ ] Déclaration d'usage de l'IA : [ai-usage.md](ai-usage.md), validée par le capitaine.
- [ ] Composants et licences : régénérés avec `bun run licenses -- --out=docs/cadev/third-party-licenses.md`. **MPL-2.0 (`lightningcss`) à déclarer dans la partie « technologies »** (acceptée par l'organisateur à cette condition).
- [ ] Déclarations d'auteur : [author-declaration.md](author-declaration.md), une par membre, nom, identifiant GitHub, rôle, ville et date remplis.
- [ ] Vidéo 16:9 de 3 min ([video-storyboard.md](video-storyboard.md)), lien YouTube et MP4.
- [ ] Pitch : [pitch.md](pitch.md), hébergement écrit selon l'état réel.
- [ ] Dépôt public : `bunx gitleaks detect --log-opts="--all"` sur un clone complet, puis visibilité publique (action humaine).
- [ ] Thème imposé et champs du formulaire : toujours non publiés au 31 oct. ; les demander à cadev@systalink.com (#234) et relire le règlement.
- [ ] Inscription Datacloud : pays de représentation (définitif, art. 4), représentant unique, clé de répartition du prix. Produit Datacloud acquis (art. 6) : preuve d'achat conservée.

## Release `v1.0.0`

1. Ouvrir la PR `develop` vers `main` et la fusionner (`main` et `develop` avaient divergé, voir #35).
2. `gh workflow run production.yml --ref main -f version=v1.0.0` (workflow **Release**, approbation du capitaine et de @lamafx). Si la production n'est pas sur Systalink, adapter selon la décision du 5 au 8 nov.
3. Vérifier `/api/v1/health` : version `v1.0.0` et SHA du commit.
4. Vérifier que l'étiquette `v1.0.0` et la Release GitHub existent.

## À ne pas inventer

Heure limite exacte, calendrier officiel des votes, éligibilité (langue, pays) après l'ouverture aux anglophones, format du pitch et de la vidéo, transfert des droits : rien de cela n'est confirmé. Ne rien écrire dans le dossier sans la source.
