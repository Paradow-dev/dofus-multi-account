/**
 * Icônes de classe officielles, bundlées localement.
 *
 * Les fichiers `src/renderer/assets/classes/{id}.png` sont récupérés une fois
 * via le script `npm run fetch:class-icons` (réseau requis) puis intégrés au
 * build par Vite. On les charge ici avec `import.meta.glob` : la liste reflète
 * ce qui existe réellement sur le disque au moment du build. Si une icône
 * manque (script pas encore lancé, classe absente…), l'appelant retombe sur
 * l'emblème monochrome de `classGlyphs.ts`.
 *
 * Les URLs produites par Vite sont servies depuis l'origine de l'app, donc
 * compatibles avec la CSP `img-src 'self'` — aucun accès réseau à l'exécution.
 */

// Chaque entrée : chemin du module -> URL finale (hashée) de l'asset.
const modules = import.meta.glob('./assets/classes/*.png', {
  eager: true,
  query: '?url',
  import: 'default'
}) as Record<string, string>

/** Map `classId` -> URL de l'icône bundlée (dérivée du nom de fichier). */
const URL_BY_ID: Record<string, string> = {}
for (const [path, url] of Object.entries(modules)) {
  const id = path.split('/').pop()?.replace(/\.png$/, '')
  if (id) URL_BY_ID[id] = url
}

/** URL de l'icône bundlée d'une classe, ou `undefined` si absente. */
export function classIconUrl(classId?: string): string | undefined {
  return classId ? URL_BY_ID[classId] : undefined
}

/** Vrai si au moins une icône de classe a été bundlée. */
export function hasClassIcons(): boolean {
  return Object.keys(URL_BY_ID).length > 0
}
