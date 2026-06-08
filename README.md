# Dofus Multi-Account

Application de bureau (Electron + TypeScript) pour jouer plus facilement en
multi-compte sur Dofus : définissez des **raccourcis globaux** pour basculer
instantanément entre vos fenêtres et organiser leur disposition.

> ⚠️ L'outil ne fait que de la **gestion de fenêtres** (mise au premier plan,
> placement). Il ne réplique **pas** les touches vers plusieurs clients : ce
> type d'automatisation est contraire aux CGU d'Ankama.

## Fonctionnalités

- **Cycle suivant / précédent** — un raccourci global passe au compte suivant
  ou précédent dans l'ordre défini.
- **Raccourci dédié par compte** — ex. `Ctrl+Alt+1` active directement un perso.
- **Disposition des fenêtres** — au changement de compte : ne rien faire,
  agrandir la fenêtre active, ou tout disposer en mosaïque.
- **Détection automatique** des fenêtres Dofus par titre, avec réordonnancement
  manuel dans l'interface.
- Vit dans la **zone de notification** (tray) ; activable/désactivable à la volée.

## Plateforme

> **Windows uniquement.** La gestion des fenêtres repose sur `node-window-manager`
> (addon natif Win32). L'installation, le développement et les tests doivent se
> faire **sous Windows** (PowerShell / CMD), pas dans un shell WSL/Linux.
> Sous WSL l'app démarre mais ne détecte aucune fenêtre (dégradation gracieuse).

## Développement

```powershell
npm install      # sous Windows : compile l'addon natif
npm run dev       # lance l'app avec HMR
npm run typecheck # vérification TypeScript
npm run build     # bundle main / preload / renderer dans out/
npm run package   # génère l'installeur + portable .exe dans dist/ (electron-builder)
```

## Architecture

| Couche | Dossier | Rôle |
|--------|---------|------|
| Main | `src/main/` | détection fenêtres, focus, placement, raccourcis globaux, config |
| Preload | `src/preload/` | pont `contextBridge` typé (`window.api`) |
| Renderer | `src/renderer/` | UI de configuration (TS vanilla + design system Paradow) |
| Partagé | `src/shared/types.ts` | types et canaux IPC |

Le design system **Paradow / Midnight Ember** est dans `design-system/` et
consommé tel quel par le renderer (tokens, composants, polices, thèmes dark/light).

## Configuration

La config (comptes, ordre, raccourcis, disposition) est persistée via
`electron-store` et rechargée au démarrage. Tout est éditable dans l'UI.
