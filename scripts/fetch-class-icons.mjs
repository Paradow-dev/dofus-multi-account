#!/usr/bin/env node
/**
 * Télécharge les icônes de classe Dofus depuis le CDN DofusDB et les écrit dans
 * `src/renderer/assets/classes/{id}.png` (consommées par classIcons.ts).
 *
 *   npm run fetch:class-icons
 *
 * Réseau requis (DofusDB n'est pas joignable depuis tous les environnements).
 * Les fichiers obtenus sont des assets Ankama : non versionnés (cf. .gitignore).
 *
 * Le mapping `id numérique DofusDB -> id texte` reflète l'ordre des classes de
 * l'encyclopédie (identique à CLASSES dans src/renderer/classGlyphs.ts).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = resolve(ROOT, 'src/renderer/assets/classes')

const API = 'https://api.dofusdb.fr'
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

/** id numérique de race Ankama/DofusDB -> id texte utilisé par l'app. */
const CLASS_BY_BREED_ID = {
  1: 'feca',
  2: 'osamodas',
  3: 'enutrof',
  4: 'sram',
  5: 'xelor',
  6: 'ecaflip',
  7: 'eniripsa',
  8: 'iop',
  9: 'cra',
  10: 'sadida',
  11: 'sacrieur',
  12: 'pandawa',
  13: 'roublard',
  14: 'zobal',
  15: 'steamer',
  16: 'eliotrope',
  17: 'huppermage',
  18: 'ouginak',
  19: 'forgelance'
}

const IMG_RE = /\.(png|jpg|jpeg|webp)(\?|$)/i

/** Récupère récursivement toutes les chaînes ressemblant à une URL d'image. */
function collectImageUrls(value, acc = []) {
  if (typeof value === 'string') {
    if (/^https?:\/\//i.test(value) && IMG_RE.test(value)) acc.push(value)
  } else if (Array.isArray(value)) {
    for (const v of value) collectImageUrls(v, acc)
  } else if (value && typeof value === 'object') {
    // Priorise les clés évocatrices (symbol/icon/img/head) sans s'y limiter.
    const entries = Object.entries(value).sort(([a], [b]) => rank(b) - rank(a))
    for (const [, v] of entries) collectImageUrls(v, acc)
  }
  return acc
}

function rank(key) {
  return /symbol|icon|img|head|emblem/i.test(key) ? 1 : 0
}

async function fetchOk(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) return null
  const type = res.headers.get('content-type') || ''
  if (!type.startsWith('image/')) return null
  return Buffer.from(await res.arrayBuffer())
}

/** Résout et télécharge l'icône d'une race ; renvoie le buffer ou null. */
async function resolveIcon(breed) {
  const candidates = [
    ...collectImageUrls(breed),
    // Schémas d'URL connus du CDN (au cas où le JSON ne porte pas l'image).
    `${API}/img/breeds/${breed.id}.png`,
    `${API}/img/breedsIcons/${breed.id}.png`,
    `${API}/img/symbol/${breed.id}.png`
  ]
  const seen = new Set()
  for (const url of candidates) {
    if (seen.has(url)) continue
    seen.add(url)
    try {
      const buf = await fetchOk(url)
      if (buf) return { buf, url }
    } catch {
      /* on tente le candidat suivant */
    }
  }
  return null
}

async function main() {
  console.log(`→ Récupération des races depuis ${API}/breeds`)
  const res = await fetch(`${API}/breeds?lang=fr&$limit=50`, {
    headers: { 'User-Agent': UA }
  })
  if (!res.ok) throw new Error(`GET /breeds a échoué (HTTP ${res.status})`)
  const json = await res.json()
  const breeds = Array.isArray(json) ? json : (json.data ?? [])
  if (breeds.length === 0) throw new Error('Aucune race renvoyée par le CDN.')

  await mkdir(OUT_DIR, { recursive: true })

  let ok = 0
  const missing = []
  for (const breed of breeds) {
    const id = CLASS_BY_BREED_ID[breed.id]
    if (!id) continue // race inconnue de l'app (ignorée)
    const found = await resolveIcon(breed)
    if (!found) {
      missing.push(id)
      console.warn(`  ✗ ${id} (breed ${breed.id}) — aucune icône trouvée`)
      continue
    }
    await writeFile(resolve(OUT_DIR, `${id}.png`), found.buf)
    ok++
    console.log(`  ✓ ${id.padEnd(11)} ← ${found.url}`)
  }

  console.log(`\nTerminé : ${ok} icône(s) écrite(s) dans ${OUT_DIR}`)
  if (missing.length) {
    console.warn(
      `Manquantes : ${missing.join(', ')}. Le schéma DofusDB a peut-être changé —\n` +
        `inspecte un objet race via ${API}/breeds?lang=fr et ajuste resolveIcon().`
    )
  }
}

main().catch((err) => {
  console.error('Échec :', err.message)
  process.exit(1)
})
