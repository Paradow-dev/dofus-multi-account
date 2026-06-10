import Store from 'electron-store'
import { z } from 'zod'
import { DEFAULT_CONFIG, type AppConfig } from '@shared/types'

const layoutModeSchema = z.enum(['none', 'grid', 'maximize-active'])

const accountSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  matchTitle: z.string(),
  order: z.number().int().nonnegative(),
  shortcut: z.string().optional()
})

const overlaySchema = z
  .object({
    enabled: z.boolean().default(false),
    opacity: z.number().min(0.2).max(1).default(0.9),
    x: z.number().optional(),
    y: z.number().optional()
  })
  .default({ enabled: false, opacity: 0.9 })

const configSchema = z.object({
  accounts: z.array(accountSchema),
  cycleNext: z.string(),
  cyclePrev: z.string(),
  layoutMode: layoutModeSchema,
  enabled: z.boolean(),
  // .default : les configs persistées avant cette option restent valides.
  turnFollow: z.boolean().default(false),
  overlay: overlaySchema
})

const store = new Store<{ config: AppConfig }>({
  defaults: { config: DEFAULT_CONFIG }
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
