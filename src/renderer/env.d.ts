/// <reference types="vite/client" />

import type { RendererApi } from '@shared/types'

declare global {
  interface Window {
    api: RendererApi
  }
}

declare module '*.svg' {
  const src: string
  export default src
}

export {}
