/**
 * Types partagés entre main, preload et renderer.
 * Pas de dépendance Electron/Node ici — uniquement des structures de données.
 */

export type LayoutMode = 'none' | 'grid' | 'maximize-active'

/** Un compte configuré par l'utilisateur, associé à une fenêtre Dofus par titre. */
export interface AccountConfig {
  /** Identifiant stable généré à la création (ne change jamais). */
  id: string
  /** Libellé affiché (ex. nom du personnage). */
  label: string
  /** Sous-chaîne recherchée dans le titre de la fenêtre pour la réconciliation. */
  matchTitle: string
  /** Position dans l'ordre de cycle (0 = premier). */
  order: number
  /** Accélérateur Electron dédié (ex. "Ctrl+Alt+1"), optionnel. */
  shortcut?: string
}

/** Overlay flottant affichant le nom du personnage actif. */
export interface OverlayConfig {
  /** Affiche (ou non) l'overlay always-on-top. */
  enabled: boolean
  /** Opacité de la fenêtre d'overlay (0.2 → 1). */
  opacity: number
  /** Position persistée du coin haut-gauche (px écran). Absent = centré en haut. */
  x?: number
  y?: number
}

/**
 * Mini-navigateur en overlay : fenêtre dédiée, redimensionnable, always-on-top
 * activable, pour consulter des guides de quêtes tout en gardant le jeu visible.
 */
/** Un site favori du navigateur overlay. */
export interface Favorite {
  title: string
  url: string
}

export interface BrowserConfig {
  /** Affiche (ou non) la fenêtre du mini-navigateur. */
  enabled: boolean
  /** Opacité de la fenêtre (0.3 → 1), réglée depuis la page « Navigateur ». */
  opacity: number
  /** Page d'accueil ouverte par défaut et via le bouton « Accueil ». */
  homeUrl: string
  /** URLs des onglets ouverts (restaurés à la réouverture). */
  tabs?: string[]
  /** Sites favoris (accès rapide depuis le menu favoris). */
  favorites?: Favorite[]
  /** Géométrie persistée de la fenêtre (px écran). Absente = centrée. */
  x?: number
  y?: number
  width?: number
  height?: number
}

/** Configuration applicative complète, persistée via electron-store. */
export interface AppConfig {
  accounts: AccountConfig[]
  /** Accélérateur du cycle « compte suivant ». */
  cycleNext: string
  /** Accélérateur du cycle « compte précédent ». */
  cyclePrev: string
  /** Accélérateur pour afficher/masquer l'overlay du nom de personnage. */
  overlayToggle?: string
  /** Accélérateur pour afficher/masquer le navigateur overlay. */
  browserToggle?: string
  /** Disposition appliquée lors d'un changement de compte. */
  layoutMode: LayoutMode
  /** Interrupteur global : si false, aucun raccourci n'est enregistré. */
  enabled: boolean
  /** Suivi de tour auto : bascule vers la fenêtre qui flashe (tour de jeu). */
  turnFollow: boolean
  /** Overlay du nom de personnage. */
  overlay: OverlayConfig
  /** Mini-navigateur en overlay (guides de quêtes). */
  browser: BrowserConfig
}

/** Une fenêtre détectée à l'exécution. */
export interface DetectedWindow {
  /** Handle natif (HWND) — change à chaque lancement du jeu. */
  handle: number
  title: string
  /** Chemin de l'exécutable propriétaire de la fenêtre, si disponible. */
  exePath?: string
  /** true si la fenêtre ressemble à un client Dofus (titre ou exe). */
  isGame: boolean
  bounds: { x: number; y: number; width: number; height: number }
  /** id du compte auquel cette fenêtre a été réconciliée, le cas échéant. */
  accountId?: string
}

/** Résultat de l'enregistrement des raccourcis, remonté à l'UI. */
export interface ShortcutRegistration {
  accelerator: string
  /** Description de l'action (ex. "Compte: Iop", "Cycle suivant"). */
  label: string
  /** false si globalShortcut.register a échoué (conflit avec une autre app). */
  ok: boolean
}

/** Statut de la mise à jour automatique. */
export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  /** Version disponible (available/downloaded). */
  version?: string
  /** Progression du téléchargement en % (downloading). */
  percent?: number
  /** Message d'erreur (error). */
  error?: string
}

/** Canaux IPC — source unique de vérité pour main, preload et renderer. */
export const IPC = {
  configGet: 'config:get',
  configSet: 'config:set',
  appVersion: 'app:version',
  windowsList: 'windows:list',
  actionFocus: 'action:focus',
  actionCycle: 'action:cycle',
  shortcutsState: 'shortcuts:state',
  updateState: 'update:state',
  updateCheck: 'update:check',
  updateInstall: 'update:install',
  /** main → overlay : nom du personnage actif à afficher. */
  overlayCharacter: 'overlay:character',
  /** overlay → main : taille souhaitée (px) pour adapter la fenêtre au contenu. */
  overlayResize: 'overlay:resize',
  /** renderer → main : réinitialise la position de l'overlay (re-centre en haut). */
  overlayResetPosition: 'overlay:reset-position',
  /** renderer → main : ouvre (ou met au premier plan) la fenêtre du navigateur. */
  browserOpen: 'browser:open',
  /** renderer → main : ferme la fenêtre du navigateur. */
  browserClose: 'browser:close',
  /** navigateur → main : lit la configuration courante du navigateur. */
  browserConfigGet: 'browser:config-get',
  /** navigateur → main : mémorise les URLs des onglets ouverts. */
  browserPersistTabs: 'browser:persist-tabs',
  /** navigateur → main : mémorise la liste des sites favoris. */
  browserPersistFavorites: 'browser:persist-favorites',
  /** main → fenêtres : nouvel état de configuration du navigateur (réglages). */
  browserState: 'browser:state',
  /** main → navigateur : ouvrir un nouvel onglet (lien ouvrant une nouvelle fenêtre). */
  browserOpenTab: 'browser:open-tab',
  /** main → navigateur : zoom appliqué à une webview (raccourci clavier / molette). */
  browserZoomSync: 'browser:zoom-sync'
} as const

export type CycleDirection = 'next' | 'prev'

export const DEFAULT_CONFIG: AppConfig = {
  accounts: [],
  cycleNext: 'Ctrl+Alt+Right',
  cyclePrev: 'Ctrl+Alt+Left',
  layoutMode: 'maximize-active',
  enabled: true,
  turnFollow: false,
  overlay: { enabled: false, opacity: 0.9 },
  browser: {
    enabled: false,
    opacity: 1,
    homeUrl: 'https://www.google.com'
  }
}

/** API exposée au renderer via contextBridge (window.api). */
export interface RendererApi {
  /** Version de l'application (depuis package.json / build). */
  getVersion(): Promise<string>
  getConfig(): Promise<AppConfig>
  setConfig(config: AppConfig): Promise<{ config: AppConfig; shortcuts: ShortcutRegistration[] }>
  listWindows(includeAll?: boolean): Promise<DetectedWindow[]>
  focusAccount(accountId: string): Promise<boolean>
  cycle(direction: CycleDirection): Promise<boolean>
  onShortcutsState(cb: (registrations: ShortcutRegistration[]) => void): () => void
  /** Lance une vérification manuelle de mise à jour. */
  checkUpdate(): Promise<void>
  /** Quitte et installe la mise à jour téléchargée. */
  installUpdate(): Promise<void>
  /** S'abonne aux changements d'état de mise à jour. Retourne une fonction de désabonnement. */
  onUpdateState(cb: (state: UpdateState) => void): () => void
  /** (Fenêtre overlay) S'abonne au nom du personnage actif. Retourne une fonction de désabonnement. */
  onOverlayCharacter(cb: (name: string) => void): () => void
  /** (Fenêtre overlay) Demande d'adapter la taille de la fenêtre au contenu (px). */
  resizeOverlay(width: number, height: number): void
  /** Réinitialise la position de l'overlay (re-centre en haut de l'écran). */
  resetOverlayPosition(): Promise<void>
  /** Ouvre (ou met au premier plan) la fenêtre du mini-navigateur. */
  openBrowser(): Promise<void>
  /** Ferme la fenêtre du mini-navigateur. */
  closeBrowser(): Promise<void>
  /** (Fenêtre navigateur) Lit la configuration courante du navigateur. */
  getBrowserConfig(): Promise<BrowserConfig>
  /** (Fenêtre navigateur) Mémorise les URLs des onglets ouverts. */
  persistBrowserTabs(urls: string[]): void
  /** (Fenêtre navigateur) Mémorise la liste des sites favoris. */
  persistBrowserFavorites(favorites: Favorite[]): void
  /** S'abonne aux changements de réglages du navigateur. Retourne une fonction de désabonnement. */
  onBrowserState(cb: (config: BrowserConfig) => void): () => void
  /** (Fenêtre navigateur) S'abonne aux demandes d'ouverture d'onglet (clic sur un lien). */
  onBrowserOpenTab(cb: (tab: { url: string; active: boolean }) => void): () => void
  /** (Fenêtre navigateur) S'abonne au zoom appliqué côté main (raccourci / molette). */
  onBrowserZoom(cb: (z: { wcId: number; factor: number }) => void): () => void
}
