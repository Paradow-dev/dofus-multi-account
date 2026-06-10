/**
 * Capture des PNG de l'UI réelle (renderer compilé dans out/renderer) avec une
 * API mockée (scripts/preview-api.cjs). Rend les pages Comptes, Overlay, À propos.
 *
 * Usage : npm run build && xvfb-run -a ./node_modules/.bin/electron --no-sandbox scripts/preview-ui.cjs
 */
const { app, BrowserWindow } = require('electron')
const { join, resolve } = require('node:path')

const ROOT = resolve(__dirname, '..')
const INDEX = join(ROOT, 'out/renderer/index.html')
const PRELOAD = join(ROOT, 'scripts/preview-api.cjs')

const W = 1180
const H = 820

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W,
    height: H,
    show: false,
    backgroundColor: '#0E1116',
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      offscreen: true
    }
  })

  await win.loadFile(INDEX)
  await sleep(900)

  async function shot(navLabel, file) {
    if (navLabel) {
      await win.webContents.executeJavaScript(`
        (() => {
          const b = Array.from(document.querySelectorAll('.toc-link'))
            .find((el) => el.textContent.trim().startsWith(${JSON.stringify(navLabel)}));
          if (b) b.click();
        })();
      `)
      await sleep(350)
    }
    const img = await win.webContents.capturePage()
    require('node:fs').writeFileSync(join(ROOT, file), img.toPNG())
    console.log('Écrit :', file)
  }

  await shot(null, 'ui-comptes.png')
  await shot('Overlay', 'ui-overlay.png')
  await shot('À propos', 'ui-apropos.png')

  app.quit()
})
