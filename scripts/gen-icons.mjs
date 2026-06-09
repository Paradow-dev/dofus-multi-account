/**
 * Génère les icônes de l'application (PNG + ICO) à partir du logo du design
 * system « Midnight Ember » (design-system/logo/midnight-ember__favicon-512.svg).
 *
 * Rasteriseur pur Node (aucune dépendance) : le logo n'est composé que de formes
 * géométriques simples (fond arrondi, chevron tracé, accent rouge), rendues ici
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
const BG = [0x0e, 0x11, 0x16] // #0E1116
const STROKE = [0xf4, 0xf1, 0xea] // #F4F1EA
const ACCENT = [0xff, 0x5c, 0x57] // #FF5C57
const CORNER = 96 // rayon des coins arrondis
// translate(110 110) scale(2.92) appliqué aux coordonnées locales (0..100)
const TX = 110
const TY = 110
const SC = 2.92
const local = (x, y) => [TX + SC * x, TY + SC * y]
const CHEVRON = [local(28, 22), local(64, 50), local(28, 78)]
const STROKE_W = 9 * SC // épaisseur du tracé
const RED = { x: TX + SC * 70, y: TY + SC * 72, w: 18 * SC, h: 8 * SC }

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

/** Segment épais avec capuchons carrés (square cap) : prolonge de hw à chaque bout. */
function inSquareCappedSegment(px, py, a, b, hw) {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = Math.hypot(dx, dy)
  if (len === 0) return false
  const ux = dx / len
  const uy = dy / len
  const along = (px - a[0]) * ux + (py - a[1]) * uy
  const perp = Math.abs((px - a[0]) * -uy + (py - a[1]) * ux)
  return along >= -hw && along <= len + hw && perp <= hw
}

/**
 * Couleur RGBA d'un point (échantillon unique) dans l'espace mis à l'échelle.
 * `transparentBg` : sans fond (usage tray) — seuls le chevron et l'accent sont
 * peints, le reste reste transparent.
 */
function sample(px, py, scale, transparentBg) {
  const size = BASE * scale
  const onIcon = insideRoundedRect(px, py, size, CORNER * scale)
  if (!transparentBg && !onIcon) return null // hors icône → transparent

  const hw = (STROKE_W * scale) / 2
  // Ordre de peinture : fond → chevron → accent rouge.
  const rx = RED.x * scale
  const ry = RED.y * scale
  if (px >= rx && px <= rx + RED.w * scale && py >= ry && py <= ry + RED.h * scale) {
    return ACCENT
  }
  for (let i = 0; i < CHEVRON.length - 1; i++) {
    const a = [CHEVRON[i][0] * scale, CHEVRON[i][1] * scale]
    const b = [CHEVRON[i + 1][0] * scale, CHEVRON[i + 1][1] * scale]
    if (inSquareCappedSegment(px, py, a, b, hw)) return STROKE
  }
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

// Icône du tray (fond transparent, chevron clair) embarquée en base64 dans
// src/main/tray.ts — affichée telle quelle dans la zone de notification.
const trayPng = encodePNG(renderRGBA(32, true), 32)
writeFileSync(join(outDir, 'tray.png'), trayPng)

console.log('Icônes générées dans build/ :')
console.log('  icon.ico  (', icoSizes.join(', '), 'px )')
console.log('  icon.png  ( 512 px )')
console.log('  tray.png  ( 32 px, transparent )')
console.log('\nBase64 du tray (à coller dans src/main/tray.ts) :')
console.log(trayPng.toString('base64'))
