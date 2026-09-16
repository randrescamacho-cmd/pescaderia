import type { IpcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { assertAuthenticated, type SessionStore } from '../auth/session'
import { getDailyCutReport } from '../db/queries/reports'

/**
 * Wiring de `reports:dailyCut` (tasks.md 8.1). Guard `assertAuthenticated`
 * (mismo criterio que `credit:*`/`sales:create`): generar el Corte del Dia
 * expone montos de dinero real de la tienda, requiere sesion activa, pero
 * no esta restringido a Administrador -- ninguna spec de `daily-report`
 * exige ese nivel de restriccion, y el Usuario tambien necesita poder
 * revisar el corte al cerrar su turno.
 */
export function registerReportsIpc(ipcMain: IpcMain, db: DatabaseSync, session: SessionStore): void {
  ipcMain.handle('reports:dailyCut', (_event, shiftId: number) => {
    assertAuthenticated(session.getRole())
    return getDailyCutReport(db, shiftId)
  })
}
