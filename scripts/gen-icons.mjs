/**
 * Génère les icônes de l'application (PNG + ICO) — logo propre à l'app :
 * concept « jetons de comptes » (trois pastilles/avatars superposés, le plus
 * en avant en rouge = compte actif), qui illustre la gestion multi-compte.
 *
 * Rasteriseur pur Node (aucune dépendance) : le logo n'est composé que de formes
 * géométriques simples (fond arrondi, disques, anneaux, silhouettes), rendues ici
 * par échantillonnage supersamplé pour un anti-crénelage propre.
 *
 * Sorties :
 *   build/icon.ico  — icône Windows (multi-résolutions, entrées PNG) → exe + installeur
 *   build/icon.png  — icône 512 px (fenêtre BrowserWindow en dev)
 *
 * Régénérer : `node scripts/gen-icons.mjs`
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/* ---------- Géométrie (espace de référence 512×512, cf. favicon-512.svg) ---------- */

const BASE = 512
const BG = [0x0e, 0x11, 0x16] // #0E1116 — fond
const ACCENT = [0xff, 0x5c, 0x57] // #FF5C57 — jeton actif (rouge Midnight Ember)
const MID = [0x9a, 0x9e, 0xa6] // jeton intermédiaire (gris clair)
const DIM = [0x5c, 0x60, 0x68] // jeton arrière (gris sombre)
const CORNER = 96 // rayon des coins arrondis

/**
 * Concept « jetons de comptes » : trois pastilles (silhouettes de personnage)
 * qui se chevauchent, la plus en avant en rouge = compte actif. Évoque le
 * multi-compte / multi-fenêtre. Espace de référence 512×512.
 */
const TOKEN_R = 96 // rayon d'un jeton
const RING_W = 12 // épaisseur de l'anneau
// Du fond vers l'avant : arrière (gris sombre), milieu (gris clair), avant (rouge).
// Léger fond élevé pour détacher les pastilles superposées.
const TOKENS = [
  { cx: 190, cy: 262, fill: [0x18, 0x1c, 0x23], ring: DIM, person: DIM },
  { cx: 256, cy: 262, fill: [0x1d, 0x22, 0x2b], ring: MID, person: MID },
  { cx: 322, cy: 262, fill: [0x24, 0x2b, 0x37], ring: ACCENT, person: ACCENT }
]

/* ---------- Tests géométriques ---------- */

/** Distance signée à un rectangle arrondi centré (positif à l'extérieur). */
function insideRoundedRect(px, py, size, radius) {
  // demi-dimensions
  const h = size / 2
  const dx = Math.abs(px - h) - (h - radius)
  const dy = Math.abs(py - h) - (h - radius)
  const ax = Math.max(dx, 0)
  const ay = Math.max(dy, 0)
  const outside = Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - radius
  return outside <= 0
}

/**
 * Silhouette « personnage » dans un jeton (coordonnées déjà mises à l'échelle) :
 * tête (disque) + buste (demi-ellipse), reliés pour former une icône d'avatar.
 */
function insidePerson(px, py, cx, cy, r) {
  const headR = 0.26 * r
  const headCy = cy - 0.2 * r
  if (Math.hypot(px - cx, py - headCy) <= headR) return true
  // Buste : moitié supérieure d'une ellipse.
  const bustCy = cy + 0.5 * r
  const rx = 0.46 * r
  const ry = 0.46 * r
  const nx = (px - cx) / rx
  const ny = (py - bustCy) / ry
  return py <= bustCy && nx * nx + ny * ny <= 1
}

/** Couleur du jeton le plus en avant couvrant ce point, ou null. */
function tokenAt(px, py, scale) {
  // TOKENS est ordonné arrière→avant : on teste de l'avant vers l'arrière.
  for (let i = TOKENS.length - 1; i >= 0; i--) {
    const t = TOKENS[i]
    const cx = t.cx * scale
    const cy = t.cy * scale
    const r = TOKEN_R * scale
    const d = Math.hypot(px - cx, py - cy)
    if (d <= r) {
      if (d > r - RING_W * scale) return t.ring
      if (insidePerson(px, py, cx, cy, r)) return t.person
      return t.fill
    }
  }
  return null
}

/**
 * Couleur RGBA d'un point (échantillon unique) dans l'espace mis à l'échelle.
 * `transparentBg` : sans fond arrondi (usage tray) — seuls les jetons sont peints.
 */
function sample(px, py, scale, transparentBg) {
  const size = BASE * scale
  const onIcon = insideRoundedRect(px, py, size, CORNER * scale)
  if (!transparentBg && !onIcon) return null // hors icône → transparent

  const tk = tokenAt(px, py, scale)
  if (tk) return tk
  return transparentBg ? null : BG
}

/** Rend une icône carrée de `size` px en RGBA (Buffer), supersampling 4×4. */
function renderRGBA(size, transparentBg = false) {
  const scale = size / BASE
  const SS = 4
  const buf = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          const c = sample(px, py, scale, transparentBg)
          if (c) {
            r += c[0]
            g += c[1]
            b += c[2]
            a += 255
          }
        }
      }
      const n = SS * SS
      const o = (y * size + x) * 4
      // Pré-multiplie pour éviter les franges sombres sur les bords transparents.
      const cov = a / n
      buf[o] = cov > 0 ? Math.round(r / (a / 255)) : 0
      buf[o + 1] = cov > 0 ? Math.round(g / (a / 255)) : 0
      buf[o + 2] = cov > 0 ? Math.round(b / (a / 255)) : 0
      buf[o + 3] = Math.round(cov)
    }
  }
  return buf
}

/* ---------- Encodage PNG (RGBA, sans dépendance) ---------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

function encodePNG(rgba, size) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  ihdr[10] = 0 // compression
  ihdr[11] = 0 // filter
  ihdr[12] = 0 // interlace

  // Scanlines préfixées d'un octet de filtre (0 = aucun).
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const idat = deflateSync(raw, { level: 9 })

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------- Assemblage ICO (entrées PNG, Windows Vista+) ---------- */

function encodeICO(pngs) {
  // pngs: [{ size, data }]
  const count = pngs.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // réservé
  header.writeUInt16LE(1, 2) // type : icône
  header.writeUInt16LE(count, 4)

  const dir = Buffer.alloc(16 * count)
  let offset = 6 + 16 * count
  pngs.forEach((p, i) => {
    const o = i * 16
    dir[o] = p.size >= 256 ? 0 : p.size // 0 ⇒ 256
    dir[o + 1] = p.size >= 256 ? 0 : p.size
    dir[o + 2] = 0 // palette
    dir[o + 3] = 0 // réservé
    dir.writeUInt16LE(1, o + 4) // plans
    dir.writeUInt16LE(32, o + 6) // bits/pixel
    dir.writeUInt32LE(p.data.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += p.data.length
  })

  return Buffer.concat([header, dir, ...pngs.map((p) => p.data)])
}

/* ---------- Génération ---------- */

const outDir = join(ROOT, 'build')
mkdirSync(outDir, { recursive: true })

const icoSizes = [16, 24, 32, 48, 64, 128, 256]
const pngs = icoSizes.map((size) => ({ size, data: encodePNG(renderRGBA(size), size) }))

writeFileSync(join(outDir, 'icon.ico'), encodeICO(pngs))
writeFileSync(join(outDir, 'icon.png'), encodePNG(renderRGBA(512), 512))

// Icône du tray (fond transparent, jetons) embarquée en base64 dans
// src/main/tray.ts — affichée telle quelle dans la zone de notification.
const trayPng = encodePNG(renderRGBA(32, true), 32)
writeFileSync(join(outDir, 'tray.png'), trayPng)

console.log('Icônes générées dans build/ :')
console.log('  icon.ico  (', icoSizes.join(', '), 'px )')
console.log('  icon.png  ( 512 px )')
console.log('  tray.png  ( 32 px, transparent )')
console.log('\nBase64 du tray (à coller dans src/main/tray.ts) :')
console.log(trayPng.toString('base64'))
