import type { IpcMain } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { createSessionStore } from '../auth/session'
import { runMigrations } from '../db/migrate'
import { openShift } from '../db/queries/cash'
import { registerReportsIpc } from './reports'

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

describe('registerReportsIpc', () => {
  it('wires reports:dailyCut and returns the 9-section report when authenticated', async () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const session = createSessionStore()
    session.login('usuario')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerReportsIpc(ipcMain, db, session)

    const handler = handlers.get('reports:dailyCut')!
    const report = (await handler({}, shift.id)) as { shiftId: number; cashEntriesTotal: number }

    expect(report.shiftId).toBe(shift.id)
    expect(report.cashEntriesTotal).toBe(500)
  })

  it('rejects reports:dailyCut when there is no active session (real guard: an existing shift id would otherwise succeed)', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const session = createSessionStore()
    const { ipcMain, handlers } = createFakeIpcMain()
    registerReportsIpc(ipcMain, db, session)

    const handler = handlers.get('reports:dailyCut')!

    expect(() => handler({}, shift.id)).toThrow(/sesion activa/)
  })
})
