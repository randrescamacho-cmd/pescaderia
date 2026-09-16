import type { IpcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { assertAuthenticated, type SessionStore } from '../auth/session'
import { cashIn, cashOut, closeShift, getOpenShift, listCashMovements, openShift } from '../db/queries/cash'
import { getRoleId } from '../db/queries/roles'

/**
 * Wiring de `cash:*` (tasks.md 6.1-6.3). Mismo criterio de guard que
 * `ipc/sales.ts`: `assertAuthenticated`, no restringido a administrador --
 * cualquier cajero opera la caja de su turno. `cash:getOpenShift` queda sin
 * guard (lectura, la necesita el renderer antes de saber si puede vender o
 * debe mostrar la pantalla de apertura).
 *
 * `getRoleId` (tasks.md pendiente documentado en apply-progress.md "PR2 ->
 * Pendiente para PR3") resuelve el `Role` de la sesion al `roles.id`
 * INTEGER que exige la FK `shifts.opened_by_role_id`/`closed_by_role_id`.
 */
export function registerCashIpc(ipcMain: IpcMain, db: DatabaseSync, session: SessionStore): void {
  ipcMain.handle('cash:getOpenShift', () => getOpenShift(db))

  ipcMain.handle('cash:openShift', (_event, openingCash: number) => {
    assertAuthenticated(session.getRole())
    const roleId = getRoleId(db, session.getRole()!)
    return openShift(db, roleId, openingCash)
  })

  ipcMain.handle('cash:cashIn', (_event, shiftId: number, amount: number, concept: string) => {
    assertAuthenticated(session.getRole())
    return cashIn(db, shiftId, amount, concept)
  })

  ipcMain.handle(
    'cash:cashOut',
    (_event, shiftId: number, amount: number, concept: string, provider: string) => {
      assertAuthenticated(session.getRole())
      return cashOut(db, shiftId, amount, concept, provider)
    }
  )

  ipcMain.handle('cash:listMovements', (_event, shiftId: number) => listCashMovements(db, shiftId))

  ipcMain.handle('cash:closeShift', (_event, shiftId: number, countedCash: number) => {
    assertAuthenticated(session.getRole())
    const roleId = getRoleId(db, session.getRole()!)
    return closeShift(db, shiftId, roleId, countedCash)
  })
}
