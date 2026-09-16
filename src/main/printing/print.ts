import { BrowserWindow } from 'electron'
import type { PrintResult } from '../../shared/ipc-types'

/**
 * `printing/print.ts` (tasks.md 9.4): crea una `BrowserWindow` oculta
 * (`show: false`), carga el HTML del ticket via `data:` URL, e invoca
 * `webContents.print()` (ticket-printing/spec.md "Native Print Dialog, No
 * Raw ESC/POS" -- dialogo nativo del sistema, nada de comandos ESC/POS
 * crudos por USB/serial).
 *
 * Sin test automatizado dedicado: requiere una `BrowserWindow` real de
 * Electron (proceso GUI), mismo precedente ya documentado y justificado en
 * PR1-3 para `src/main/preload.ts`/`src/main/index.ts` ("wiring... NO
 * cubierto con pruebas automatizadas" -- no hay libreria de testing de
 * Electron en el proyecto, y agregarla solo para esta funcion seria tooling
 * nuevo no solicitado). La logica SI testeable (que HTML se construye para
 * cada tipo de ticket) vive en `ticket-template.ts` (con TDD completo) y en
 * `ipc/print.ts` (wiring probado inyectando esta funcion como parametro).
 *
 * Cancelar el dialogo nativo (ticket-printing/spec.md "Cancelar
 * impresion") resuelve `{ printed: false }`, NO es un error -- la
 * venta/reporte ya persistidos no se ven afectados. Un fallo real (p.ej.
 * impresora desconectada) rechaza la promesa para que la UI pueda mostrar
 * el error y ofrecer reintentar (tasks.md 9.6) sin perder los datos ya
 * guardados/calculados.
 */
export function printHtml(html: string): Promise<PrintResult> {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({ show: false, webPreferences: { sandbox: false } })

    win
      .loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      .then(() => {
        win.webContents.print({ silent: false }, (success, errorType) => {
          win.close()
          if (!success && errorType && errorType !== 'cancelled') {
            reject(new Error(`No se pudo imprimir: ${errorType}`))
            return
          }
          resolve({ printed: success })
        })
      })
      .catch((error) => {
        win.close()
        reject(error)
      })
  })
}
