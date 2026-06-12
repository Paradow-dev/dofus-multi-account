import Store from 'electron-store'
import { z } from 'zod'
import { DEFAULT_CONFIG, type AppConfig } from '@shared/types'

const layoutModeSchema = z.enum(['none', 'grid', 'maximize-active'])

const accountSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  matchTitle: z.string(),
  order: z.number().int().nonnegative(),
  shortcut: z.string().optional(),
  class: z.string().optional()
})

const overlaySchema = z
  .object({
    enabled: z.boolean().default(false),
    opacity: z.number().min(0.2).max(1).default(0.9),
    x: z.number().optional(),
    y: z.number().optional()
  })
  .default({ enabled: false, opacity: 0.9 })

const accountBarSchema = z
  .object({
    enabled: z.boolean().default(false),
    opacity: z.number().min(0.2).max(1).default(0.95),
    x: z.number().optional(),
    y: z.number().optional()
  })
  .default({ enabled: false, opacity: 0.95 })

const browserSchema = z
  .object({
    enabled: z.boolean().default(false),
    opacity: z.number().min(0.3).max(1).default(1),
    homeUrl: z.string().default(DEFAULT_CONFIG.browser.homeUrl),
    tabs: z.array(z.string()).optional(),
    favorites: z
      .array(z.object({ title: z.string(), url: z.string() }))
      .optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional()
  })
  .default(DEFAULT_CONFIG.browser)

const combatZoneSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive()
})

const combatSchema = z
  .object({
    endTurnKey: z.string().default('F1'),
    switchDelay: z.number().min(0).max(2000).default(150),
    autoDetect: z.boolean().default(false),
    detectZone: combatZoneSchema.optional(),
    detectSignature: z.array(z.number()).optional()
  })
  .default(DEFAULT_CONFIG.combat)

const quickMacroSchema = z
  .object({
    enabled: z.boolean().default(false),
    shortcut: z.string().default('Ctrl+Alt+R'),
    countdownSec: z.number().min(0).max(10).default(3),
    betweenAccountsMs: z.number().min(0).max(2000).default(600),
    opacity: z.number().min(0.2).max(1).default(0.95),
    x: z.number().optional(),
    y: z.number().optional()
  })
  .default(DEFAULT_CONFIG.quickMacro)

const configSchema = z.object({
  accounts: z.array(accountSchema),
  cycleNext: z.string(),
  cyclePrev: z.string(),
  overlayToggle: z.string().optional(),
  browserToggle: z.string().optional(),
  accountBarToggle: z.string().optional(),
  combatToggle: z.string().optional(),
  layoutMode: layoutModeSchema,
  enabled: z.boolean(),
  overlay: overlaySchema,
  accountBar: accountBarSchema,
  browser: browserSchema,
  combat: combatSchema,
  quickMacro: quickMacroSchema,
  hideOverlaysOutsideGame: z.boolean().default(false)
})

const store = new Store<{ config: AppConfig }>({
  defaults: { config: DEFAULT_CONFIG },
  migrations: {
    // Les overlays restent désormais affichés en permanence par défaut :
    // bascule one-shot des configs existantes (le réglage « Masquer les
    // overlays hors du jeu » reste disponible pour qui veut le réactiver).
    '1.8.2': (s) => {
      const cfg = s.get('config')
      if (cfg) s.set('config', { ...cfg, hideOverlaysOutsideGame: false })
    }
  }
})

/** Lit la config persistée ; retombe sur les défauts si le contenu est invalide. */
export function loadConfig(): AppConfig {
  const raw = store.get('config')
  const parsed = configSchema.safeParse(raw)
  if (!parsed.success) {
    return DEFAULT_CONFIG
  }
  return parsed.data
}

/** Valide puis persiste la config. Lève si la structure est invalide. */
export function saveConfig(config: AppConfig): AppConfig {
  const validated = configSchema.parse(config)
  store.set('config', validated)
  return validated
}
