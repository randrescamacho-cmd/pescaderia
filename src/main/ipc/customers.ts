import type { IpcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { createCustomer, listCustomers } from '../db/queries/customers'

/**
 * Wiring de `customers:list`/`customers:create` (selector/creador de
 * cliente para la porcion de pago `credito`, tasks.md 7.6). Sin guard: es
 * una accion que el cajero necesita poder hacer inline dentro del modal de
 * pago dividido sin friccion adicional de rol (ninguna spec restringe
 * "registrar cliente nuevo" a Administrador). `customers:create` NO otorga
 * credito por si sola -- solo crea el registro del cliente; el saldo se
 * escribe con `credit:grant` (Fase 7, `ipc/credit.ts`).
 */
export function registerCustomersIpc(ipcMain: IpcMain, db: DatabaseSync): void {
  ipcMain.handle('customers:list', () => listCustomers(db))
  ipcMain.handle('customers:create', (_event, name: string) => createCustomer(db, name))
}
