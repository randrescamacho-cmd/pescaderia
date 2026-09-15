// Preload del proceso principal (design.md: vive en src/main/preload.ts, no
// en el src/preload/ default de electron-vite). `contextIsolation: true` +
// `nodeIntegration: false` (design.md Decision 2) hacen que este sea el
// UNICO puente entre el renderer y Node/Electron.
//
// Fase 1 (este PR) solo deja el bridge listo, sin superficie de API todavia:
// la Fase 3 (auth:login/auth:changePin) y fases posteriores agregaran los
// metodos reales via `contextBridge.exposeInMainWorld('api', { ... })`.
import { contextBridge } from 'electron'

const api = {} as const

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error -- fallback solo si contextIsolation estuviera deshabilitado
  window.api = api
}
