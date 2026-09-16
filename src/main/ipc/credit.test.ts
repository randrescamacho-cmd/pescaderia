import type { IpcMain } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { createSessionStore } from '../auth/session'
import { runMigrations } from '../db/migrate'
import { createCustomer } from '../db/queries/customers'
import { openShift } from '../db/queries/cash'
import { registerCreditIpc } from './credit'

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

describe('registerCreditIpc', () => {
  it('grants credit and returns the updated balance when the session is authenticated', async () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const rosa = createCustomer(db, 'Dona Rosa')
    const session = createSessionStore()
    session.login('usuario')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCreditIpc(ipcMain, db, session)

    const grant = handlers.get('credit:grant')!
    const result = (await grant({}, { customerId: rosa.id, saleId: null, shiftId: shift.id, amount: 250 })) as {
      balance: number
    }

    expect(result.balance).toBe(250)
  })

  it('rejects credit:grant when there is no active session (real guard, not a tautological throw)', async () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const rosa = createCustomer(db, 'Dona Rosa')
    const session = createSessionStore()
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCreditIpc(ipcMain, db, session)

    const grant = handlers.get('credit:grant')!

    expect(() => grant({}, { customerId: rosa.id, saleId: null, shiftId: shift.id, amount: 250 })).toThrow(
      /sesion activa/
    )
  })

  it('registers a credit payment when authenticated', async () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const rosa = createCustomer(db, 'Dona Rosa')
    const session = createSessionStore()
    session.login('administrador')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCreditIpc(ipcMain, db, session)
    const grant = handlers.get('credit:grant')!
    await grant({}, { customerId: rosa.id, saleId: null, shiftId: shift.id, amount: 250 })

    const pay = handlers.get('credit:pay')!
    const result = (await pay({}, { customerId: rosa.id, shiftId: shift.id, amount: 100 })) as {
      balance: number
    }

    expect(result.balance).toBe(150)
  })

  it('rejects credit:pay when there is no active session (real guard: a valid existing balance would otherwise succeed)', async () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const rosa = createCustomer(db, 'Dona Rosa')
    const adminSession = createSessionStore()
    adminSession.login('administrador')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCreditIpc(ipcMain, db, adminSession)
    const grant = handlers.get('credit:grant')!
    await grant({}, { customerId: rosa.id, saleId: null, shiftId: shift.id, amount: 250 })
    adminSession.logout()

    const pay = handlers.get('credit:pay')!

    expect(() => pay({}, { customerId: rosa.id, shiftId: shift.id, amount: 100 })).toThrow(/sesion activa/)
  })

  it('wires credit:balance without a role guard (read-only)', async () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const rosa = createCustomer(db, 'Dona Rosa')
    const session = createSessionStore()
    session.login('usuario')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCreditIpc(ipcMain, db, session)
    const grant = handlers.get('credit:grant')!
    await grant({}, { customerId: rosa.id, saleId: null, shiftId: shift.id, amount: 90 })
    session.logout()

    const balance = handlers.get('credit:balance')!
    expect(await balance({}, rosa.id)).toBe(90)
  })

  it('wires credit:listBalances without a role guard (Creditos screen, tasks.md 7.7)', async () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const rosa = createCustomer(db, 'Dona Rosa')
    const session = createSessionStore()
    session.login('usuario')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCreditIpc(ipcMain, db, session)
    const grant = handlers.get('credit:grant')!
    await grant({}, { customerId: rosa.id, saleId: null, shiftId: shift.id, amount: 90 })

    const listBalances = handlers.get('credit:listBalances')!
    const balances = (await listBalances({})) as { name: string; balance: number }[]

    expect(balances.find((b) => b.name === 'Dona Rosa')?.balance).toBe(90)
  })
})
