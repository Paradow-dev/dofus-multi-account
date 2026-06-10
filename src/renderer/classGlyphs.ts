/**
 * Emblèmes de classe (overlay barre de comptes) — icônes monochromes
 * minimalistes (formes géométriques originales, pas l'art officiel Ankama).
 * Chaque emblème est rendu en `currentColor` dans un viewBox 0 0 24 24.
 */

export interface DofusClass {
  id: string
  label: string
}

/** Classes Dofus proposées dans le sélecteur (ordre de l'encyclopédie). */
export const CLASSES: DofusClass[] = [
  { id: 'feca', label: 'Féca' },
  { id: 'osamodas', label: 'Osamodas' },
  { id: 'enutrof', label: 'Enutrof' },
  { id: 'sram', label: 'Sram' },
  { id: 'xelor', label: 'Xélor' },
  { id: 'ecaflip', label: 'Ecaflip' },
  { id: 'eniripsa', label: 'Eniripsa' },
  { id: 'iop', label: 'Iop' },
  { id: 'cra', label: 'Crâ' },
  { id: 'sadida', label: 'Sadida' },
  { id: 'sacrieur', label: 'Sacrieur' },
  { id: 'pandawa', label: 'Pandawa' },
  { id: 'roublard', label: 'Roublard' },
  { id: 'zobal', label: 'Zobal' },
  { id: 'steamer', label: 'Steamer' },
  { id: 'eliotrope', label: 'Eliotrope' },
  { id: 'huppermage', label: 'Huppermage' },
  { id: 'ouginak', label: 'Ouginak' },
  { id: 'forgelance', label: 'Forgelance' }
]

const CO = 'currentColor'
const S = (d: string): string =>
  `<path d="${d}" fill="none" stroke="${CO}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
const Fp = (d: string): string => `<path d="${d}" fill="${CO}"/>`
const L = (a: number, b: number, x: number, y: number): string =>
  `<line x1="${a}" y1="${b}" x2="${x}" y2="${y}" stroke="${CO}" stroke-width="2" stroke-linecap="round"/>`
const Ci = (x: number, y: number, r: number): string => `<circle cx="${x}" cy="${y}" r="${r}" fill="${CO}"/>`
const CiS = (x: number, y: number, r: number): string =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${CO}" stroke-width="2"/>`
const El = (x: number, y: number, rx: number, ry: number): string =>
  `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="none" stroke="${CO}" stroke-width="2"/>`

/** Markup interne (sans la balise <svg>) de chaque emblème. */
const GLYPHS: Record<string, () => string> = {
  iop: () => Fp('M12,2 L14,12 L10,12 Z') + L(8, 12, 16, 12) + L(12, 12, 12, 18) + Ci(12, 19, 1.4),
  cra: () => S('M8,4 A8 8 0 0 1 8,20') + L(8, 4, 8, 20) + L(6, 12, 19, 12) + S('M15,9 L19,12 L15,15'),
  eniripsa: () => Fp('M5,15 C9,8 15,7 20,8 C16,13 11,16 5,16 Z'),
  ecaflip: () =>
    S('M7,5 L9,10') + S('M17,5 L15,10') + S('M7,11 a5,6 0 0 0 10,0 a5,6 0 0 0 -10,0 Z') + Ci(10, 12, 1) + Ci(14, 12, 1),
  feca: () => S('M12,3 L19,6 V12 C19,17 15,20 12,21 C9,20 5,17 5,12 V6 Z') + L(12, 8, 12, 16) + L(8.5, 12, 15.5, 12),
  sadida: () => Fp('M12,3 C18,7 18,15 12,21 C6,15 6,7 12,3 Z') + L(12, 21, 12, 23),
  sram: () =>
    S('M6,11 a6,6 0 1 1 12,0 c0,3 -2,5 -4,6 l-4,0 c-2,-1 -4,-3 -4,-6 Z') + Ci(10, 11, 1.3) + Ci(14, 11, 1.3),
  xelor: () => CiS(12, 12, 8) + L(12, 12, 12, 7) + L(12, 12, 16, 13),
  enutrof: () => CiS(12, 12, 8) + Fp('M12,8 L15,12 L12,16 L9,12 Z'),
  osamodas: () => S('M7,5 C9,11 9,15 8,20') + S('M12,4 C13,11 13,16 12,21') + S('M17,5 C15,11 15,15 16,20'),
  sacrieur: () => Fp('M12,3 C8,9 6,12 6,15 a6,6 0 0 0 12,0 C18,12 16,9 12,3 Z'),
  pandawa: () => S('M8,7 C8,5 16,5 16,7 L15,18 C15,20 9,20 9,18 Z') + L(16, 9, 18, 8) + L(8, 12, 16, 12),
  roublard: () => Ci(11, 15, 6) + S('M15,11 C17,9 18,7 18,5') + Ci(18, 4, 1.3),
  zobal: () => S('M4,12 C8,9 16,9 20,12 C16,16 14,16 12,16 C10,16 8,16 4,12 Z') + L(8, 12, 10, 12) + L(14, 12, 16, 12),
  steamer: () => CiS(12, 5, 2) + L(12, 7, 12, 18) + L(8, 10, 16, 10) + S('M6,15 C7,19 10,20 12,20 C14,20 17,19 18,15'),
  eliotrope: () => El(12, 12, 5, 8) + El(12, 12, 2, 4),
  huppermage: () => S('M12,3 L20,12 L12,21 L4,12 Z') + L(12, 7, 12, 17) + L(8, 12, 16, 12),
  ouginak: () => El(12, 15, 5, 4) + Ci(7, 9, 1.8) + Ci(10, 7, 1.8) + Ci(14, 7, 1.8) + Ci(17, 9, 1.8),
  forgelance: () => L(5, 19, 16, 8) + Fp('M15,9 L20,4 L19,10 Z') + Ci(5, 19, 1.3),
  // Repli : silhouette générique (aucune classe choisie).
  person: () => Ci(12, 9.5, 3.4) + Fp('M6.5,19 a5.5 5.5 0 0 1 11 0 Z')
}

/** Markup interne d'un emblème (repli sur la silhouette si la classe est inconnue). */
export function classGlyphInner(classId?: string): string {
  return (classId && GLYPHS[classId] ? GLYPHS[classId] : GLYPHS.person)()
}
