import type { IpcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { authenticate } from '../auth/authenticate'
import { hashPin } from '../auth/pin'
import { assertRole, type SessionStore } from '../auth/session'
import { getRoleCredentials, updateRolePin } from '../db/queries/roles'
import type { ChangePinInput, LoginResult } from '../../shared/ipc-types'

/**
 * Wiring de `ipcMain.handle` para `auth:*` (tasks.md 3.4/3.5). Capa fina a
 * proposito: toda la logica de negocio real (comparar PIN, decidir permisos)
 * ya vive en funciones puras/probadas (`authenticate`, `assertRole`,
 * `hashPin`) -- este archivo solo conecta esas funciones con el canal IPC y
 * la conexion real a SQLite, igual que `src/main/index.ts` conecta
 * `createConnection`/`runMigrations` sin tener tests propios (wiring, no
 * logica).
 */
export function registerAuthIpc(ipcMain: IpcMain, db: DatabaseSync, session: SessionStore): void {
  ipcMain.handle('auth:login', (_event, pin: string): LoginResult => {
    const role = authenticate(pin, getRoleCredentials(db))

    if (!role) {
      return { ok: false, role: null }
    }

    session.login(role)
    return { ok: true, role }
  })

  ipcMain.handle('auth:changePin', (_event, input: ChangePinInput): { ok: boolean } => {
    assertRole(session.getRole(), 'administrador')

    const { salt, hash } = hashPin(input.newPin)
    updateRolePin(db, input.role, salt, hash)

    return { ok: true }
  })

  ipcMain.handle('auth:logout', () => {
    session.logout()
  })
}
