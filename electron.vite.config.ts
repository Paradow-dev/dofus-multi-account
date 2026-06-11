import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // Modules natifs / node-only : externes (non bundlés)
        external: ['node-window-manager', 'electron-store', 'electron-updater', 'koffi']
      }
    },
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  preload: {
    resolve: {
      alias: { '@shared': resolve('src/shared') }
    }
  },
  renderer: {
    root: 'src/renderer',
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        // Paradow design system (provided in design-system/)
        '@ds': resolve('design-system')
      }
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          overlay: resolve('src/renderer/overlay.html'),
          accountbar: resolve('src/renderer/accountbar.html'),
          browser: resolve('src/renderer/browser.html'),
          zonepicker: resolve('src/renderer/zonepicker.html')
        }
      }
    }
  }
})
