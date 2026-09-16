import type { IpcMain } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { createSessionStore } from '../auth/session'
import { runMigrations } from '../db/migrate'
import { registerCashIpc } from './cash'

type Handler = (...args: unknown[]) => unknown

function createFakeIpcMain(): { ipcMain: IpcMain; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>()
  const ipcMain = {
    handle: (channel: string, listener: Handler) => {
      handlers.set(channel, listener)
    }
  } as unknown as IpcMain

  return { ipcMain, handlers }
}

function openMigratedDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true })
  runMigrations(db)
  return db
}

describe('registerCashIpc', () => {
  // Nota adversarial (mismo criterio que ipc/sales.test.ts): con role=null,
  // `getRoleId(db, null)` YA lanza por su cuenta (no encuentra fila) sin
  // necesidad del guard -- un `toThrow()` generico aqui seria tautologico
  // (verificado: remover `assertAuthenticated` de los 3 handlers guardados
  // de este archivo dejo las 5 pruebas de este describe en verde igual).
  // Por eso se exige el mensaje EXACTO de `assertAuthenticated`
  // ("sesion activa"), que es distinto del mensaje de `getRoleId`
  // ("Rol desconocido") -- si se borra el guard, este handler seguiria
  // lanzando pero con OTRO mensaje, y esta aserción especifica fallaria.
  it('rejects cash:openShift when there is no active session', () => {
    const db = openMigratedDb()
    const session = createSessionStore()
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCashIpc(ipcMain, db, session)

    const handler = handlers.get('cash:openShift')!

    expect(() => handler({}, 500)).toThrow(/sesion activa/)
  })

  it('allows cash:openShift for the usuario role and resolves the role id for the shift FK', async () => {
    const db = openMigratedDb()
    const session = createSessionStore()
    session.login('usuario')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCashIpc(ipcMain, db, session)

    const handler = handlers.get('cash:openShift')!

    const shift = (await handler({}, 500)) as { openingCash: number; openedByRoleId: number }
    expect(shift.openingCash).toBe(500)
    expect(typeof shift.openedByRoleId).toBe('number')
  })

  it('does not guard cash:getOpenShift (read-only, needed before login-gated actions)', async () => {
    const db = openMigratedDb()
    const session = createSessionStore()
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCashIpc(ipcMain, db, session)

    const handler = handlers.get('cash:getOpenShift')!

    expect(await handler({})).toBeNull()
  })

  // Nota adversarial: usa un turno REAL (insertado directo por SQL, sin
  // pasar por `openShift`/sesion) con concept+provider VALIDOS -- si no
  // fuera por el guard, `cashOut` tendria EXITO (no lanzaria nada). Con un
  // `shiftId` inventado, la FK de `cash_movements.shift_id` habria lanzado
  // por su cuenta sin necesidad del guard (mismo problema que arriba,
  // verificado con el mismo experimento de remover el guard).
  it('rejects cash:cashOut without an active session', () => {
    const db = openMigratedDb()
    const shiftResult = db
      .prepare('INSERT INTO shifts (opened_by_role_id, opening_cash) VALUES (1, 500)')
      .run()
    const shiftId = Number(shiftResult.lastInsertRowid)
    const session = createSessionStore()
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCashIpc(ipcMain, db, session)

    const handler = handlers.get('cash:cashOut')!

    expect(() => handler({}, shiftId, 300, 'compra de hielo', 'Hielera del Puerto')).toThrow(
      /sesion activa/
    )
  })

  it('wires cash:closeShift end-to-end for an authenticated role', async () => {
    const db = openMigratedDb()
    const session = createSessionStore()
    session.login('administrador')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCashIpc(ipcMain, db, session)

    const openHandler = handlers.get('cash:openShift')!
    const shift = (await openHandler({}, 1200)) as { id: number }

    const closeHandler = handlers.get('cash:closeShift')!
    const result = (await closeHandler({}, shift.id, 1200)) as { difference: number }

    expect(result.difference).toBe(0)
  })
})
