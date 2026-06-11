# Icônes de classe

Ce dossier contient les icônes de classe (`{id}.png`) consommées par
`src/renderer/classIcons.ts` et intégrées au build par Vite.

Les fichiers ne sont **pas** versionnés (voir `.gitignore`) : ce sont des assets
Ankama récupérés depuis un CDN tiers (DofusDB). Récupère-les localement avec :

```bash
npm run fetch:class-icons
```

Tant que les icônes ne sont pas présentes, l'app retombe automatiquement sur les
emblèmes monochromes de `classGlyphs.ts` — rien ne casse.

Les `id` de fichier correspondent aux `id` de `CLASSES` dans `classGlyphs.ts`
(`feca`, `osamodas`, …, `forgelance`).
