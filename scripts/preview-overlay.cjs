/**
 * Génère un aperçu PNG de l'overlay « nom du personnage ».
 * Réutilise les tokens du design system + overlay.css réels, et pose la pilule
 * sur un faux décor de jeu pour illustrer l'effet always-on-top et l'opacité.
 *
 * Usage : xvfb-run -a ./node_modules/.bin/electron scripts/preview-overlay.cjs
 */
const { app, BrowserWindow } = require('electron')
const { writeFileSync, readFileSync } = require('node:fs')
const { join, resolve } = require('node:path')

const ROOT = resolve(__dirname, '..')
// CSS réels inlinés (un document file:// chargerait les liens, mais l'inline
// évite toute dépendance d'origine et reste fidèle aux fichiers du dépôt).
const tokensCss = readFileSync(join(ROOT, 'design-system/tokens/tokens.css'), 'utf8')
const overlayCss = readFileSync(join(ROOT, 'src/renderer/overlay.css'), 'utf8')
const OUT = join(ROOT, 'overlay-preview.png')
const TMP_HTML = join(ROOT, 'scripts', '_overlay-preview.html')

const W = 880
const H = 460

function card(name, opacity, caption) {
  return `
    <div class="variant">
      <div class="overlay-card" style="opacity:${opacity}">
        <span class="overlay-dot"></span>
        <span class="overlay-name">${name}</span>
      </div>
      <div class="caption">${caption}</div>
    </div>`
}

const html = `<!doctype html>
<html lang="fr" data-theme="dark">
<head>
<meta charset="UTF-8" />
<style>
${tokensCss}
${overlayCss}
</style>
<style>
  html, body { margin:0; width:${W}px; height:${H}px; overflow:hidden; }
  /* Faux décor de "jeu" en arrière-plan pour matérialiser l'always-on-top. */
  body {
    background:
      radial-gradient(900px 500px at 70% -10%, #1d2733 0%, transparent 60%),
      radial-gradient(700px 400px at 10% 120%, #241a1a 0%, transparent 55%),
      linear-gradient(135deg, #0b0e13 0%, #11161d 100%);
    font-family: var(--font-sans);
    color: var(--ink);
    position: relative;
  }
  .game-hint {
    position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    font-size:64px; font-weight:700; letter-spacing:.04em; color: rgba(244,241,234,0.045);
    text-transform:uppercase;
  }
  .stage { position:relative; height:100%; box-sizing:border-box; padding:28px 32px;
           display:flex; flex-direction:column; }
  .title { font-size:13px; letter-spacing:.18em; text-transform:uppercase; color:var(--ink-3); }
  .sub   { font-size:20px; font-weight:600; margin-top:4px; }
  /* Overlay placé "en haut", comme posé sur le jeu. */
  .floating { position:absolute; top:26px; right:34px; }
  .floating .overlay-card { cursor: default; }
  .variants { margin-top:auto; display:flex; flex-direction:column; gap:14px; align-items:flex-start; }
  .variant { display:flex; align-items:center; gap:14px; }
  .variant .caption { white-space:nowrap; }
  .variant .overlay-card { cursor: default; }
  .caption { font-family: var(--font-mono); font-size:12px; color:var(--ink-3); }
</style>
</head>
<body>
  <div class="game-hint">Dofus</div>
  <div class="stage">
    <div>
      <div class="title">Overlay always-on-top</div>
      <div class="sub">Nom du personnage actif</div>
    </div>

    <div class="floating">
      ${'' /* pilule telle qu'affichée en jeu, opacité par défaut 90% */}
      <div class="overlay-card" style="opacity:.9">
        <span class="overlay-dot"></span>
        <span class="overlay-name">Lyssaen - Sacrieur</span>
      </div>
    </div>

    <div class="variants">
      ${card('Iop', 0.9, 'Nom court → pilule étroite')}
      ${card('Lyssaen - Sacrieur', 0.9, 'Nom moyen → s’élargit')}
      ${card('Lyssaen - Sacrieur - 3.5.1.x - Release', 0.9, 'Trop long → tronqué (max)')}
    </div>
  </div>
</body>
</html>`

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W,
    height: H,
    show: false,
    webPreferences: { offscreen: true }
  })
  writeFileSync(TMP_HTML, html)
  await win.loadFile(TMP_HTML)
  await new Promise((r) => setTimeout(r, 600))
  const image = await win.webContents.capturePage()
  writeFileSync(OUT, image.toPNG())
  console.log('Aperçu écrit :', OUT)
  app.quit()
})
