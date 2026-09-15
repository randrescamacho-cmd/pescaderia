/// <reference types="vite/client" />

import type { PosApi } from '../shared/ipc-types'

declare global {
  interface Window {
    api: PosApi
  }
}
