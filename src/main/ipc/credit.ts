import type { IpcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { assertAuthenticated, type SessionStore } from '../auth/session'
import {
  getCustomerBalance,
  grantCredit,
  listCustomerBalances,
  payCredit
} from '../db/queries/credits'
import type { GrantCreditInput, PayCreditInput } from '../../shared/ipc-types'

/**
 * Wiring de `credit:*` (tasks.md 7.1-7.3). Mismo criterio de guard que
 * `ipc/sales.ts`/`ipc/cash.ts`: `assertAuthenticated` en las mutaciones
 * (grant/pay) -- otorgar o cobrar credito es dinero real, requiere sesion
 * activa, pero NO esta restringido a Administrador (ninguna spec de
 * `customer-credit` lo exige). Las lecturas (`balance`/`listBalances`)
 * quedan sin guard, mismo criterio que `cash:getOpenShift`/`customers:list`.
 */
export function registerCreditIpc(ipcMain: IpcMain, db: DatabaseSync, session: SessionStore): void {
  ipcMain.handle('credit:grant', (_event, input: GrantCreditInput) => {
    assertAuthenticated(session.getRole())
    return grantCredit(db, input)
  })

  ipcMain.handle('credit:pay', (_event, input: PayCreditInput) => {
    assertAuthenticated(session.getRole())
    return payCredit(db, input)
  })

  ipcMain.handle('credit:balance', (_event, customerId: number) => getCustomerBalance(db, customerId))

  ipcMain.handle('credit:listBalances', () => listCustomerBalances(db))
}
