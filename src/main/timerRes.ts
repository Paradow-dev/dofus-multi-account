/**
 * Résolution des timers Windows (winmm.dll, timeBeginPeriod/timeEndPeriod).
 *
 * Par défaut, l'horloge système tique toutes les ~15,6 ms : les setInterval(1)
 * des pompes de messages des hooks bas-niveau et les sleeps de la lecture de
 * macro ne sont alors honorés qu'à ~15 ms près — curseur saccadé à la lecture,
 * latence d'entrée pendant l'enregistrement.
 *
 * Demandes refcomptées : la résolution 1 ms n'est demandée qu'une fois tant
 * qu'au moins un consommateur (hook actif, enregistrement, lecture) en a
 * besoin, et relâchée dès que le dernier termine.
 */

type Fn = (...args: unknown[]) => unknown

let timeBeginPeriod: Fn | null = null
let timeEndPeriod: Fn | null = null
let loaded = false
let depth = 0

function load(): boolean {
  if (loaded) return timeBeginPeriod !== null
  loaded = true
  if (process.platform !== 'win32') return false
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const koffi = require('koffi') as typeof import('koffi')
    const winmm = koffi.load('winmm.dll')
    timeBeginPeriod = winmm.func('uint32 timeBeginPeriod(uint32)') as unknown as Fn
    timeEndPeriod = winmm.func('uint32 timeEndPeriod(uint32)') as unknown as Fn
    return true
  } catch (err) {
    console.warn('[timerRes] winmm indisponible :', err)
    timeBeginPeriod = null
    timeEndPeriod = null
    return false
  }
}

/** Demande la résolution 1 ms (refcompté — appairer avec releaseHighResTimers). */
export function requestHighResTimers(): void {
  if (!load()) return
  if (depth++ === 0) {
    try {
      timeBeginPeriod!(1)
    } catch {
      /* ignore */
    }
  }
}

/** Relâche une demande de résolution 1 ms. */
export function releaseHighResTimers(): void {
  if (!load() || depth === 0) return
  if (--depth === 0) {
    try {
      timeEndPeriod!(1)
    } catch {
      /* ignore */
    }
  }
}
