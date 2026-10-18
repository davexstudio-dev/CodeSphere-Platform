# Storyboard de la vidéo

Décisions issues du ticket « Vidéo de démonstration CADEV » (#236 de la carte #218). Calqué sur le [script de démo](demo-script.md), pour servir aussi de plan B si la démo en direct échoue. Le règlement public ne publie ni durée ni format : 3 minutes par défaut, à caler si Systalink précise.

## Deux montages

- **Maîtresse 16:9 de 3 minutes** pour le dossier et le jury. Elle se termine par « Essayez CodeSphere » et l'adresse du site, **sans appel à voter** (adresse et modalités du vote public non publiées, fichier soumis le 24 oct.).
- **Coupe 9:16 de 60 secondes** pour WhatsApp, LinkedIn et les réseaux, sous-titres français incrustés (on regarde souvent sans le son). Elle est **refaite le 27 oct.** avec le vrai lien de vote : problème, démo en une scène, appel à voter.

## Phrase d'accroche

> La plateforme d'échange des développeurs africains, par et pour les devs : questions réponses, fil personnalisé et hackathons, utilisable même avec une connexion instable, et ouverte aux agents IA.

Elle s'affiche en titre au début et revient en carton final. La démo ne prouve que la Q&R, le hors-ligne et les agents ; le fil et les hackathons sont dans la phrase.

## Réglages

- Enregistrement 1920×1080, 30 i/s, navigateur en zoom 125 %, curseur agrandi. **Barre d'adresse recadrée** : l'adresse du site est ajoutée en texte au montage final, pour que l'état du déploiement ne force pas à tout refaire.
- Prises de vue d'écran uniquement, texte à l'écran, pas d'acteurs.
- Voix off **humaine**, en français, par un membre de l'équipe (pas de voix synthétique). Sous-titres français incrustés sur la coupe de 60 secondes ; sous-titres anglais en piste séparée (SRT) sur la maîtresse.
- Application réelle, contenu de démonstration signalé comme tel, aucune fonctionnalité non construite. La coupure réseau est réelle (DevTools en mode hors ligne).
- Musique libre de droits (licence à noter dans la description), volume bas sous la voix.
- Pas de vraie adresse email ni de vraie clé à l'écran : compte et agent de démo, clé floutée.
- Outils : OBS pour l'enregistrement, DaVinci Resolve ou CapCut pour le montage (vérifier l'absence de filigrane).

## Plans (maîtresse de 3 minutes)

| # | Durée | Plan | Voix off (idée) | Incrustation |
|---|---|---|---|---|
| 1 | 0:00 – 0:12 | Le problème : une erreur d'intégration mobile money, le réseau qui coupe, la développeuse bloquée. Titre : la phrase d'accroche. | Tu cherches une réponse sur mobile money, et le réseau coupe. | Phrase d'accroche |
| 2 | 0:12 – 0:25 | Gros plan sur des Questions `mobile-money`, `ussd` | Les sujets qui comptent ici, au premier plan. | « CodeSphere Platform » |
| 3 | 0:25 – 0:45 | Connexion GitHub, choix des Tags | Connexion en un clic, fil réglé sur vos Tags. | « SSO GitHub · GitLab · Google » |
| 4 | 0:45 – 1:15 | Les quatre étapes de `/ask`, aperçu Markdown | Une question claire en quatre étapes. | « Brouillon gardé hors ligne » |
| 5 | 1:15 – 1:45 | Écran partagé : terminal MCP à gauche, Question à droite ; la réponse de l'agent apparaît | Les agents IA participent comme des membres, en toute transparence. | « Agent-native : API · OpenAPI · MCP » |
| 6 | 1:45 – 1:55 | Badge « agent de … », clic sur Accepter | Toujours badgés. Jamais de vote. | — |
| 7 | 1:55 – 2:25 | Passage hors ligne, envoi en file, retour du réseau, envoi automatique | Le réseau coupe ? Rien n'est perdu. | « Local-first » |
| 8 | 2:25 – 2:45 | Page CADEV, compte à rebours, onglets | Le hackathon et ses questions, au même endroit. | « Dans votre fuseau horaire » |
| 9 | 2:45 – 3:00 | Carton final : la phrase d'accroche, l'adresse du site (texte ajouté au montage), l'équipe | Essayez CodeSphere. | Phrase d'accroche, adresse du site, équipe |

## Calendrier

- **20 oct.** : premier tournage complet (version de secours avec l'interface actuelle).
- **22 oct. au soir** : gel des fonctionnalités.
- **23 oct.** : retournage ciblé des plans dont l'interface a changé, montage final, avant la répétition générale.
- **24 oct.** : soumission. **27 oct.** : coupe de 60 secondes avec le lien de vote.

## Après le tournage

- Exporter en MP4 (H.264), garder le fichier source. Garder aussi une **version 480p légère** pour les réseaux lents.
- Héberger sur YouTube (lien dans le [README](README.md) et dans le dossier, #58) et joindre le MP4 au dossier.
- Relire les sous-titres, vérifier qu'aucune donnée personnelle n'apparaît.
