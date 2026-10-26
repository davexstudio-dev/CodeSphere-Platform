# Registre interne `@transitions`

Les transitions de [transitions.dev](https://transitions.dev) que l'interface utilise, décrites dans
`registry.json` (jetons de mouvement, puis une entrée par transition). Les fichiers vivent déjà dans
`src/` ; le registre sert à les réinstaller ou à les reprendre dans un autre paquet de ce dépôt.

**Privé, à ne jamais publier** : la licence de transitions.dev permet de les utiliser et de les
modifier dans un produit, mais interdit de republier la collection.

```sh
bunx shadcn build -o registry/r                           # écrit registry/r/*.json (ignoré par git)
bunx shadcn add ./registry/r/tabs-sliding.json      # installe l'entrée et les jetons qu'elle demande
```

L'espace de noms `@transitions` n'est pas déclaré dans `components.json` : le CLI de shadcn exige une
URL http(s) pour un espace de noms, et un fichier local ne passe pas. L'installation se fait donc par
chemin.

Choix propres à l'application, par rapport à la source : le menu et l'onglet suivent les attributs de
Base UI (`data-starting-style`, `--active-tab-*`) au lieu de classes posées à la main ; le squelette
partage une cellule de grille avec le contenu (pas de `position: absolute`) ; le panneau monte de
12 px, pas de 100 px ; le toggle utilise une transition à dépassement plutôt qu'un keyframe, pour ne
pas jouer au premier rendu. Le mode économie de données coupe déjà toute animation (`globals.css`).
