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
1bis. **Prises d'écran automatisées** : `SCRATCH=<dossier hors dépôt> BASE=<url> node scripts/record.mjs` ouvre un Chrome visible sur `/signin` (connectez-vous vous-même ; le profil reste dans `$SCRATCH`, ne jamais le committer), attend la création du fichier `$SCRATCH/ok`, puis enregistre chaque scène en `public/clips/<scène>.webm` (à convertir avec `npx remotion ffmpeg`). Rien n'est publié : la scène `/ask` s'arrête avant l'envoi. Filmer le staging, où le seed de démo est chargé. `SCENES=ask,cadev` ne refilme que ces scènes.
2. **Voix off** : générée avec **ElevenLabs** (voix synthétique française, décision du capitaine du 2026-11-09, qui remplace la voix humaine du storyboard), **un MP3 par plan** pour rester calée sur l'image. Le texte lu est le champ `voice` de chaque plan dans `src/data.ts`.
   - `bun scripts/voice.ts --dry` affiche tous les textes et fichiers sans rien appeler.
   - `ELEVENLABS_API_KEY=… ELEVENLABS_VOICE_ID=… npm run voice` écrit `public/voice/master-<plan>.mp3` et `cut-<plan>.mp3`. La clé reste dans l'environnement : ne jamais l'écrire dans un fichier ni la coller dans un chat. Les fichiers déjà générés sont ignorés (`--force` pour refaire), pour ne pas dépenser de crédits deux fois.
   - Rendre ensuite avec `npm run render:master:voice` et `npm run render:cut:voice`.
   - Vérifier que l'offre ElevenLabs autorise l'usage commercial et la publication, et conserver la licence de la voix choisie. L'usage est déclaré dans `docs/cadev/ai-usage.md`.
   - Une voix de synthèse peut mal prononcer « CodeSphere », « MCP » ou « USSD » : écouter chaque fichier, et ajuster l'écriture du champ `voice` (par exemple « Code Sphère ») sans toucher au sous-titre `en`.
3. **Musique** (facultatif) : Pixabay Music ou Free Music Archive filtré sur CC0. Relire les conditions du morceau au moment du téléchargement et noter sa source et sa licence dans la description de la vidéo. Ne pas committer le fichier (voir `.gitignore`).
4. **Appel à voter** : renseigner `VOTE_LINK` dans `src/data.ts` quand le vrai lien est publié (#237). La maîtresse n'en a jamais.

## Plans automatisés et coupe 9:16

Tous les plans de la maîtresse se tournent par script sur le **staging**, avec le profil Playwright de `record.mjs` (`SCRATCH=<dossier hors dépôt>`) :

- `node scripts/record.mjs` : `problem`, `topics`, `ask`, `offline`, `cadev`, `feed` (`SCENES=ask,cadev` pour n'en refaire que certains).
- `node scripts/record-agent.mjs` : `agent` (terminal à gauche, question à droite) et `badge`. **Renouvelle la clé de l'agent de démo** (l'ancienne cesse de marcher) et la garde en mémoire seulement.
- `node scripts/record-signin.mjs` : `signin`, par code e-mail (`EMAIL=<adresse>` ; le script attend que vous déposiez les 6 chiffres dans `$SCRATCH/code`). Le profil doit être déconnecté. L'adresse tapée apparaît à l'écran : elle est masquée au rendu (voir ci-dessous).
- Coupe 9:16 : `VIEWPORT=540x960 CLIP_PREFIX=cut- SCENES=problem,offline node scripts/record.mjs` et `LAYOUT=vertical node scripts/record-agent.mjs` (terminal en haut, page en bas). Playwright enregistre à la taille de la fenêtre : agrandir ensuite à 1080×1920 avec ffmpeg, puis recadrer et caler chaque clip sur la durée de son plan (`cut-problem.mp4`, `cut-agent.mp4`, `cut-offline.mp4`).
- `record-agent.mjs` et `record-signin.mjs` utilisent un `ffmpeg` du PATH (celui de Remotion n'a ni `hstack` ni `vstack`).

Chaque script supprime ce qu'il a publié (question de démo, réponse de test) et ne laisse rien dans la file d'envoi du profil. Vérifier après un échec.

**Données personnelles à l'écran** : `blurs` d'une scène de `src/data.ts` masque une zone (fractions de l'image, secondes depuis le début du plan). Utilisé pour l'adresse e-mail de `signin`. Le nom du compte de démo reste visible sur les plans connectés : utiliser un compte de démo si on ne veut pas le montrer.

**Rendus** (`--browser-executable` si le Chrome de Remotion ne démarre pas) : `npm run render:master:voice`, `npm run render:cut:voice`. Version légère 480p : `ffmpeg -i out/codesphere-master-16x9.mp4 -vf scale=-2:480 -crf 28 out/codesphere-master-480p.mp4`.

## Règles du storyboard

Aucune fonctionnalité non construite. Aucune vraie adresse e-mail ni clé à l'écran (clé floutée). Contenu de démonstration signalé comme tel. Sous-titres anglais en piste séparée sur la maîtresse (SRT), sous-titres français incrustés sur la coupe.
