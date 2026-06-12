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
  /** Identifiant de classe Dofus (emblème affiché dans la barre de comptes). */
  class?: string
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
 * Overlay « barre de comptes » : barre always-on-top listant tous les comptes
 * (un jeton + nom par compte), le compte actif mis en avant. Clic = focus de la
 * fenêtre. Complémentaire de l'overlay « personnage courant ».
 */
export interface AccountBarConfig {
  enabled: boolean
  /** Opacité de la fenêtre (0.2 → 1). */
  opacity: number
  /** Position persistée du coin haut-gauche (px écran). Absent = centré en haut. */
  x?: number
  y?: number
}

/** Un compte tel qu'affiché dans la barre de comptes (état runtime). */
export interface AccountBarItem {
  id: string
  label: string
  /** Identifiant de classe Dofus (emblème), si défini. */
  class?: string
  /** true si ce compte est le dernier activé. */
  active: boolean
  /** true si une fenêtre de jeu est actuellement réconciliée à ce compte. */
  detected: boolean
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

/** Zone d'écran (px, coordonnées écran) capturée pour la détection de combat. */
export interface CombatZone {
  x: number
  y: number
  width: number
  height: number
}

/** Configuration du mode combat (fin de tour automatique). */
export interface CombatConfig {
  /** Touche de fin de tour transmise à Dofus (défaut : F1). Format accélérateur Electron. */
  endTurnKey: string
  /** Délai (ms) entre la touche fin de tour et le switch de compte (défaut : 150). */
  switchDelay: number
  /** Détection automatique du combat par capture de la zone du bouton fin de tour. */
  autoDetect: boolean
  /** Zone capturée (sélectionnée par drag dans l'overlay de sélection). */
  detectZone?: CombatZone
  /** Signature de référence de la zone (calibrée pendant un combat). */
  detectSignature?: number[]
}

/**
 * Macro rapide éphémère : enregistre une séquence de touches/clics sur le compte
 * actif, puis la rejoue une fois sur les autres comptes. Rien n'est persisté —
 * la macro est effacée après exécution.
 */
export interface QuickMacroConfig {
  enabled: boolean
  /** Raccourci global pour démarrer/arrêter l'enregistrement. */
  shortcut: string
  /** Délai avant le début de l'enregistrement (secondes). */
  countdownSec: number
  /** Délai entre chaque compte lors de la lecture (ms). */
  betweenAccountsMs: number
  opacity: number
  x?: number
  y?: number
}

export type QuickMacroPhase = 'idle' | 'countdown' | 'recording' | 'confirm' | 'replaying'

export interface QuickMacroState {
  phase: QuickMacroPhase
  /** Compte à rebours restant (s) en phase countdown. */
  countdown?: number
  eventCount: number
  durationMs: number
  /** Lecture : index du compte courant (1-based) et total. */
  replayIndex?: number
  replayTotal?: number
  replayLabel?: string
  /** Nombre d'autres comptes détectés (pour le bouton « Appliquer sur les N autres »). */
  otherCount?: number
}

/** Action envoyée par le panneau macro au process principal. */
export type QuickMacroAction = 'record' | 'stop' | 'apply-all' | 'apply-active' | 'cancel'

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
  /** Accélérateur pour afficher/masquer la barre de comptes. */
  accountBarToggle?: string
  /** Accélérateur pour basculer le mode combat. */
  combatToggle?: string
  /** Disposition appliquée lors d'un changement de compte. */
  layoutMode: LayoutMode
  /** Interrupteur global : si false, aucun raccourci n'est enregistré. */
  enabled: boolean
  /** Overlay du nom de personnage. */
  overlay: OverlayConfig
  /** Overlay « barre de comptes » (tous les comptes, clic = focus). */
  accountBar: AccountBarConfig
  /** Mini-navigateur en overlay (guides de quêtes). */
  browser: BrowserConfig
  /** Mode combat : fin de tour automatique. */
  combat: CombatConfig
  /** Macro rapide éphémère (enregistrer puis rejouer sur les autres comptes). */
  quickMacro: QuickMacroConfig
  /** Masque les overlays quand la fenêtre active n'est ni Dofus ni l'outil. */
  hideOverlaysOutsideGame: boolean
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
  browserZoomSync: 'browser:zoom-sync',
  /** main → barre de comptes : liste des comptes et leurs états. */
  accountBarData: 'accountbar:data',
  /** barre de comptes → main : taille souhaitée (px) pour adapter la fenêtre. */
  accountBarResize: 'accountbar:resize',
  /** renderer → main : réinitialise la position de la barre de comptes. */
  accountBarResetPosition: 'accountbar:reset-position',
  /** barre de comptes → main : bascule le mode combat. */
  accountBarCombatToggle: 'accountbar:combat-toggle',
  /** main → toutes les fenêtres : état courant du mode combat. */
  accountBarCombatState: 'accountbar:combat-state',
  /** renderer → main : ouvre l'overlay de sélection de zone (détection combat). */
  combatZonePick: 'combat:zone-pick',
  /** fenêtre de sélection → main : zone choisie (ou null si annulé). */
  combatZonePicked: 'combat:zone-picked',
  /** renderer → main : capture la zone configurée (aperçu de la détection). */
  combatZonePreview: 'combat:zone-preview',
  /** main → panneau macro + réglages : état courant de la macro rapide. */
  macroState: 'macro:state',
  /** panneau macro → main : action utilisateur (stop / apply-all / apply-active / cancel). */
  macroAction: 'macro:action',
  /** panneau macro → main : taille souhaitée (px) pour adapter la fenêtre. */
  macroBarResize: 'macrobar:resize',
  /** renderer → main : réinitialise la position du panneau macro. */
  macroBarResetPosition: 'macrobar:reset-position'
} as const

export type CycleDirection = 'next' | 'prev'

export const DEFAULT_CONFIG: AppConfig = {
  accounts: [],
  cycleNext: 'Ctrl+Alt+Right',
  cyclePrev: 'Ctrl+Alt+Left',
  layoutMode: 'maximize-active',
  enabled: true,
  overlay: { enabled: false, opacity: 0.9 },
  accountBar: { enabled: false, opacity: 0.95 },
  browser: {
    enabled: false,
    opacity: 1,
    homeUrl: 'https://www.google.com'
  },
  combat: { endTurnKey: 'F1', switchDelay: 150, autoDetect: false },
  quickMacro: {
    enabled: false,
    shortcut: 'Ctrl+Alt+R',
    countdownSec: 3,
    betweenAccountsMs: 600,
    opacity: 0.95
  },
  hideOverlaysOutsideGame: true
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
  /** (Barre de comptes) S'abonne à la liste des comptes et leurs états. */
  onAccountBarData(cb: (items: AccountBarItem[]) => void): () => void
  /** (Barre de comptes) Demande d'adapter la taille de la fenêtre au contenu (px). */
  resizeAccountBar(width: number, height: number): void
  /** Réinitialise la position de la barre de comptes (re-centre en haut). */
  resetAccountBarPosition(): Promise<void>
  /** Bascule le mode combat (main process). */
  toggleCombat(): void
  /** S'abonne aux changements d'état du mode combat. */
  onCombatState(cb: (inCombat: boolean) => void): () => void
  /**
   * Ouvre l'overlay de sélection de zone (détection combat) et calibre la
   * signature. Retourne la config mise à jour, ou null si annulé.
   */
  pickCombatZone(): Promise<AppConfig | null>
  /** (Fenêtre de sélection) Renvoie la zone choisie au main (null = annulé). */
  sendZonePicked(zone: CombatZone | null): void
  /**
   * Capture la zone de détection configurée et retourne un aperçu :
   * image (data URL PNG), distance à la signature de référence et verdict.
   * null si aucune zone n'est définie ou si la capture échoue.
   */
  previewCombatZone(): Promise<CombatZonePreview | null>
  /** (Panneau macro) S'abonne à l'état courant de la macro rapide. */
  onQuickMacroState(cb: (state: QuickMacroState) => void): () => void
  /** (Panneau macro) Envoie une action utilisateur au process principal. */
  macroAction(action: QuickMacroAction): void
  /** (Panneau macro) Demande d'adapter la taille de la fenêtre au contenu (px). */
  resizeMacroBar(width: number, height: number): Promise<void>
  /** Réinitialise la position du panneau macro (re-centre en bas de l'écran). */
  resetMacroBarPosition(): Promise<void>
}

/** Aperçu de la zone de détection (page Mode combat). */
export interface CombatZonePreview {
  /** Capture courante de la zone (data URL PNG). */
  image: string
  /** Distance moyenne (0-255) à la signature de référence. */
  distance: number
  /** Seuil en deçà duquel la zone est considérée « en combat ». */
  threshold: number
  /** true si la capture correspond à la référence (combat détecté). */
  match: boolean
}
