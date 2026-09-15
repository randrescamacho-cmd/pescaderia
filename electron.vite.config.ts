import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Estructura de carpetas por design.md: el preload vive en src/main/preload.ts
// (no en el src/preload/ default de electron-vite), y el renderer expone sus
// pantallas/componentes directamente bajo src/renderer/ (sin sub-carpeta src/).
export default defineConfig({
  main: {},
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/preload.ts')
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer')
      }
    },
    plugins: [react()]
  }
})
