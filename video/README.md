# Vidéo CADEV avec Remotion (#358)

Projet **autonome** : il n'est pas un workspace Bun et ne fait pas partie du produit livré. Il produit la maîtresse 16:9 de 3 minutes et la coupe 9:16 de 60 secondes décrites dans [`docs/cadev/video-storyboard.md`](../docs/cadev/video-storyboard.md).

## Licence de Remotion

Remotion n'est pas sous licence permissive (`SEE LICENSE IN LICENSE.md`), mais sa licence gratuite couvre : un individu, une organisation à but lucratif de 3 employés ou moins, une organisation à but non lucratif. L'équipe participe à titre personnel, sans société : elle est éligible. **Si une société de plus de 3 employés porte un jour le projet, une licence d'entreprise devient nécessaire.** Remotion n'est ni installé ni exécuté par la plateforme ; il est déclaré dans `docs/cadev/third-party-licenses.md` (section « outils hors produit »).

## Utilisation

```bash
cd video
npm install
npm run studio              # aperçu dans le navigateur
npm run srt                 # écrit out/master.en.srt et out/cut.fr.srt
npm run render:master       # out/codesphere-master-16x9.mp4
npm run render:cut          # out/codesphere-cut-9x16.mp4
```

## Ce qu'il faut ajouter

1. **Prises d'écran** : déposer chaque plan dans `public/clips/` (un MP4 par plan, 1920×1080 pour la maîtresse, 1080×1920 pour la coupe), puis renseigner `clip: "<fichier>.mp4"` du plan dans `src/data.ts`. Tant qu'il manque, une carte « prise d'écran manquante » s'affiche.
2. **Voix off** : générée avec **ElevenLabs** (voix synthétique française, décision du capitaine du 2026-11-09, qui remplace la voix humaine du storyboard). Exporter `master.mp3` et `cut.mp3` dans `public/voice/`, puis décommenter `voiceFile` dans `src/Root.tsx`. Le script est le champ `voice` de chaque plan dans `src/data.ts`. Vérifier que l'offre ElevenLabs utilisée autorise l'usage commercial et la publication, et conserver la licence de la voix choisie. L'usage est déclaré dans `docs/cadev/ai-usage.md`.
3. **Musique** (facultatif) : Pixabay Music ou Free Music Archive filtré sur CC0. Relire les conditions du morceau au moment du téléchargement et noter sa source et sa licence dans la description de la vidéo. Ne pas committer le fichier (voir `.gitignore`).
4. **Appel à voter** : renseigner `VOTE_LINK` dans `src/data.ts` quand le vrai lien est publié (#237). La maîtresse n'en a jamais.

## Règles du storyboard

Aucune fonctionnalité non construite. Aucune vraie adresse e-mail ni clé à l'écran (clé floutée). Contenu de démonstration signalé comme tel. Sous-titres anglais en piste séparée sur la maîtresse (SRT), sous-titres français incrustés sur la coupe.
