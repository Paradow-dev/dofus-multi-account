# Paradow Kit

Tout ce qu'il faut pour démarrer un projet avec l'identité **Paradow** (Midnight Ember).

```
@paradow · pseudo de dev, joueur, identité web · always online.
```

## Structure

```
paradow-kit/
├── README.md                — ce fichier
├── tokens/
│   ├── tokens.css           — variables CSS (dark + light)
│   └── tokens.json          — tokens machine-readable
├── logo/                    — 13 SVG (lockups, marks, favicons)
├── fonts.css                — import Google Fonts
├── examples/
│   ├── button.html
│   ├── card.html
│   └── layout.html
└── design-system.html       — doc de référence complète
```

## Démarrage rapide

```html
<!DOCTYPE html>
<html lang="fr" data-theme="dark">
<head>
  <link rel="stylesheet" href="paradow-kit/fonts.css">
  <link rel="stylesheet" href="paradow-kit/tokens/tokens.css">
  <link rel="icon" href="paradow-kit/logo/midnight-ember__favicon-32.svg">
</head>
<body>
  <h1>Hello, paradow.</h1>
</body>
</html>
```

## Palette

| Token         | Hex       | Usage                          |
|---------------|-----------|--------------------------------|
| `--bg`        | `#0E1116` | Encre (fond sombre)            |
| `--ink`       | `#F4F1EA` | Papier (texte sur sombre)      |
| `--accent`    | `#FF5C57` | Ember (action, focus, curseur) |
| `--success`   | `#7DC36B` | Vert sémantique (états sains)  |
| `--danger`    | `#F16B6B` | Rouge erreur                   |

## Type

- **Space Grotesk** — texte humain (titres, paragraphes, UI)
- **Fira Code** — texte machine (tokens, code, tags, prompts)

## Modes

Bascule `<html data-theme="dark">` ↔ `<html data-theme="light">` — toutes les variables s'adaptent.

## Logo

Le mark est composé d'un **chevron** `>` + un **curseur** `▬` rouge.
Lecture : *"> _ en ligne"*.

## License

MIT — fais ce que tu veux.
