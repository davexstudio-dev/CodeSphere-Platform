# Voix off maîtresse : textes plus longs (brouillon à valider)

Textes validés pour #358, copiés dans `src/data.ts` (champs `voice` et `en`). Les MP3 de `public/voice/` sont encore les anciens : à régénérer. Après validation, ces textes remplacent le champ `voice` de chaque plan de `MASTER_SCENES`, puis `npm run voice -- --force --only=master` régénère les MP3 (clé ElevenLabs dans l'environnement).

Couverture estimée à 19 caractères par seconde (mesure sur les voix actuelles). Le champ `en` (sous-titres anglais) devra suivre.

## À vérifier contre le produit (déduit, pas lu dans le code)

- signin : « ajuster vos Tags à tout moment »
- ask : « ajoutez le contexte et le code utile », « aperçu Markdown »
- agent : « sa réponse apparaît dans le fil, sous son nom »
- cadev : « compte à rebours », « horaires dans votre fuseau horaire »
- outro : « fil personnalisé », « hackathons »

## Textes

### problem (12 s, 218 caractères, ~95 % du plan)

Tu cherches une réponse sur mobile money, et le réseau coupe en pleine lecture. Sur CodeSphere Platform, ta question reste sauvegardée sur ton appareil, même sans connexion. Quand le signal revient, tu n'as rien à refaire.

### topics (13 s, 168 caractères, raccourci : la première voix dépassait le plan)

Ici, les sujets qui comptent passent au premier plan : mobile money, USSD, et les questions du terrain. Le fil est fait pour celles et ceux qui codent sur le continent.

### signin (20 s, 268 caractères, raccourci : la première voix dépassait le plan)

Connexion en un clic avec GitHub, GitLab ou Google, sans nouveau mot de passe à retenir. Ensuite, choisissez vos Tags. Le fil se règle dessus : vous voyez les questions qui vous concernent, et le reste passe au second plan. Vous pourrez ajuster vos Tags à tout moment.

### ask (30 s, 468 caractères, ~82 % du plan)

Poser une question se fait en quelques étapes simples, du titre jusqu'à l'envoi. Vous décrivez le problème, vous ajoutez le contexte et le code utile, puis vous regardez l'aperçu Markdown pour vérifier la mise en forme avant d'envoyer. Une question claire est une question qu'on sait aider. Si le réseau coupe en cours de route, le brouillon reste sur votre appareil. Vous reprenez exactement là où vous en étiez, sans rien perdre de ce que vous avez écrit.

### agent (30 s, 379 caractères, ~66 % du plan)

Les agents IA participent comme des membres, en toute transparence. Un agent répond à une question comme n'importe quel membre, et sa réponse apparaît dans le fil, sous son nom. Chaque agent est badgé et placé sous la responsabilité d'un Owner humain, qui en répond. Ils passent par l'API, OpenAPI ou MCP, et ils ne votent jamais : la communauté reste seule à décider.

### badge (10 s, 132 caractères, raccourci : la première voix dépassait le plan)

Toujours badgés, donc reconnaissables dès la première ligne. Un agent est sous la responsabilité de son Owner, et il ne vote jamais.

### offline (30 s, 351 caractères, ~61 % du plan)

Le réseau coupe ? Rien n'est perdu. Vos brouillons restent sur l'appareil, même hors ligne, et vous continuez à écrire sans attendre le signal. Quand la connexion revient, ils partent tout seuls, sans clic supplémentaire. Vous ne recommencez jamais de zéro, même dans un endroit où le réseau va et vient, comme dans un bus ou une zone rurale.

### cadev (20 s, 324 caractères, ~85 % du plan)

Le hackathon CADEV et ses questions sont au même endroit, sur une seule page. Un compte à rebours vous montre le temps qui reste, et les horaires s'affichent dans votre fuseau horaire, pour ne rien rater. Vous passez d'un onglet à l'autre sans quitter la page, et vous suivez l'événement sans chercher où il se trouve.

### outro (15 s, 205 caractères, raccourci : la première voix dépassait le plan)

Essayez CodeSphere Platform, la plateforme des développeurs africains, par et pour les devs. Questions et réponses, fil personnalisé, hackathons et agents IA transparents, même avec une connexion instable.
