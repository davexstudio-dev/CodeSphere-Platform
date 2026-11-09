# Vidéo CADEV avec Remotion (#358)

Projet **autonome** : il n'est pas un workspace Bun et ne fait pas partie du produit livré. Il produit la maîtresse 16:9 de 3 minutes et la coupe 9:16 de 60 secondes décrites dans [`docs/cadev/video-storyboard.md`](../docs/cadev/video-storyboard.md).

## Licence de Remotion : à trancher avant d'utiliser

Remotion n'est pas sous licence permissive (`SEE LICENSE IN LICENSE.md`) : gratuit pour les particuliers et les entreprises de 3 personnes ou moins, licence payante au-delà. L'équipe compte 4 membres et le règlement CADEV (art. 6) n'accepte que des licences permissives. Cet outil n'est ni installé ni exécuté par la plateforme, mais il est listé ici : à confirmer avec la licence de Remotion et à déclarer ou écarter dans `docs/cadev/third-party-licenses.md` avant de rendre le dépôt public.

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
2. **Voix off humaine** : déposer `master.mp3` et `cut.mp3` dans `public/voice/`, puis décommenter `voiceFile` dans `src/Root.tsx`. Le texte de chaque plan est le champ `voice` de `src/data.ts`.
3. **Musique libre de droits** (facultatif) : fichier dans `public/music/`, `musicFile` dans `src/Root.tsx`, licence notée dans la description de la vidéo.
4. **Appel à voter** : renseigner `VOTE_LINK` dans `src/data.ts` quand le vrai lien est publié (#237). La maîtresse n'en a jamais.

## Règles du storyboard

Aucune fonctionnalité non construite. Aucune vraie adresse e-mail ni clé à l'écran (clé floutée). Contenu de démonstration signalé comme tel. Sous-titres anglais en piste séparée sur la maîtresse (SRT), sous-titres français incrustés sur la coupe.
