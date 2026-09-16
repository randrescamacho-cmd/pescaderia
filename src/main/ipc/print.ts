import type { IpcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { getDailyCutReport } from '../db/queries/reports'
import { getSaleTicketData } from '../db/queries/sales'
import { buildDailyCutTicketHtml, buildSaleTicketHtml } from '../printing/ticket-template'
import { printHtml } from '../printing/print'
import type { PrintResult } from '../../shared/ipc-types'

type PrintFn = (html: string) => Promise<PrintResult>

/**
 * Wiring de `print:sale`/`print:dailyCut` (tasks.md 9.5). `printFn` es
 * inyectable (por defecto `printHtml`, el `BrowserWindow` real) para poder
 * probar QUE HTML se construye para cada canal sin depender de una
 * `BrowserWindow` real de Electron -- mismo patron de inyeccion de
 * dependencias que ya usa `ipc/*.test.ts` con el `IpcMain` falso.
 *
 * Sin guard de sesion: imprimir un ticket ya calculado/guardado no expone
 * nada que la propia venta/turno no expusieran ya, y ticket-printing/
 * spec.md no restringe la impresion por rol.
 */
export function registerPrintIpc(
  ipcMain: IpcMain,
  db: DatabaseSync,
  printFn: PrintFn = printHtml
): void {
  ipcMain.handle('print:sale', async (_event, saleId: number) => {
    const data = getSaleTicketData(db, saleId)
    return printFn(buildSaleTicketHtml(data))
  })

  ipcMain.handle('print:dailyCut', async (_event, shiftId: number) => {
    const report = getDailyCutReport(db, shiftId)
    return printFn(buildDailyCutTicketHtml(report))
  })
}
