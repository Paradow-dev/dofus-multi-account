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
- **Raccourcis souris** — en plus du clavier, on peut assigner la molette (clic
  central) ou les boutons latéraux (Précédent / Suivant), éventuellement combinés
  à un modificateur (ex. `Ctrl+MouseForward`). Capté par un hook souris natif.
- **Disposition des fenêtres** — au changement de compte : ne rien faire,
  agrandir la fenêtre active, ou tout disposer en mosaïque.
- **Détection automatique** des fenêtres Dofus par titre, avec réordonnancement
  manuel dans l'interface.
- **Suivi de tour automatique** (combat) — bascule vers la fenêtre du perso dont
  c'est le tour, détecté via le clignotement (flash) de la fenêtre Dofus.
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

Les icônes de l'app (`build/icon.ico`, `build/icon.png` et l'icône du tray) sont
générées depuis le logo du design system (`midnight-ember__favicon-512.svg`) par
`node scripts/gen-icons.mjs` (rasteriseur pur Node, sans dépendance). À relancer
si le logo du design system change.

## Architecture

| Couche | Dossier | Rôle |
|--------|---------|------|
| Main | `src/main/` | détection fenêtres, focus, placement, raccourcis globaux, config |
| Preload | `src/preload/` | pont `contextBridge` typé (`window.api`) |
| Renderer | `src/renderer/` | UI de configuration (TS vanilla + design system Paradow) |
| Partagé | `src/shared/types.ts` | types et canaux IPC |

Le design system **Paradow / Midnight Ember** est dans `design-system/` et
consommé tel quel par le renderer (tokens, composants, polices, thèmes dark/light).

## Mise à jour automatique

L'application se met à jour seule via **electron-updater** + les Releases GitHub :
elle vérifie au démarrage, télécharge la nouvelle version en arrière-plan et
l'installe à la prochaine fermeture. Un indicateur s'affiche dans l'en-tête et
le menu du tray (« Vérifier les mises à jour » / « Redémarrer pour installer »).

> ⚠️ L'auto-update ne concerne que la version **installée** (installeur NSIS),
> pas la version portable. Installe au moins une fois via l'installeur.

Pour publier une nouvelle version, il suffit de **bumper `version` dans
`package.json` et de merger sur `main`** : la CI détecte qu'aucun tag ne
correspond à cette version, build, puis publie la Release et le `latest.yml`
(electron-builder crée lui-même le tag `vX.Y.Z`). Les pushes suivants à version
inchangée ne re-publient pas.

Deux autres déclencheurs équivalents restent possibles :

```bash
# 1. Pousser un tag explicitement
git tag v0.5.0 && git push origin v0.5.0
```

```text
# 2. Onglet Actions → « Build Windows » → Run workflow → cocher « Publier une release »
```

## Configuration

La config (comptes, ordre, raccourcis, disposition) est persistée via
`electron-store` et rechargée au démarrage. Tout est éditable dans l'UI.
