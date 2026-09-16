import type { IpcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { listCustomers } from '../db/queries/customers'

/**
 * Wiring de `customers:list` (selector simple de cliente para la porcion de
 * pago `credito`, ver nota de alcance en `shared/ipc-types.ts`). Sin guard:
 * es lectura, y cualquier rol autenticado que este vendiendo necesita poder
 * elegir un cliente ya capturado. NO expone crear cliente -- eso es
 * `credit:grant` (tasks.md 7.1, Fase 7/PR4).
 */
export function registerCustomersIpc(ipcMain: IpcMain, db: DatabaseSync): void {
  ipcMain.handle('customers:list', () => listCustomers(db))
}
