import type { IpcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { assertAuthenticated, type SessionStore } from '../auth/session'
import { createSale } from '../db/queries/sales'
import type { SaleInput } from '../../shared/ipc-types'

/**
 * Wiring de `sales:create` (tasks.md 5.1). Guard: `assertAuthenticated`, NO
 * `assertRole('administrador')` -- vender es una accion que cualquier rol
 * autenticado (usuario o administrador) puede hacer (tasks.md Fase 5:
 * "cualquier rol autenticado puede vender, no solo admin"), a diferencia de
 * las mutaciones de catalogo (`ipc/catalog.ts`), que SI son Admin-only.
 */
export function registerSalesIpc(ipcMain: IpcMain, db: DatabaseSync, session: SessionStore): void {
  ipcMain.handle('sales:create', (_event, input: SaleInput) => {
    assertAuthenticated(session.getRole())
    return createSale(db, input)
  })
}
