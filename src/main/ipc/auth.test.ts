import type { IpcMain } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { createSessionStore } from '../auth/session'
import { runMigrations } from '../db/migrate'
import { registerAuthIpc } from './auth'

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

describe('registerAuthIpc', () => {
  it('auth:login returns ok+role for the placeholder usuario PIN seeded in PR1', () => {
    const db = openMigratedDb()
    const session = createSessionStore()
    const { ipcMain, handlers } = createFakeIpcMain()
    registerAuthIpc(ipcMain, db, session)

    const login = handlers.get('auth:login')!
    const result = login({}, '1111') as { ok: boolean; role: string | null }

    expect(result).toEqual({ ok: true, role: 'usuario' })
    expect(session.getRole()).toBe('usuario')
  })

  it('auth:login rejects an unknown PIN and leaves the session logged out', () => {
    const db = openMigratedDb()
    const session = createSessionStore()
    const { ipcMain, handlers } = createFakeIpcMain()
    registerAuthIpc(ipcMain, db, session)

    const login = handlers.get('auth:login')!
    const result = login({}, '0000') as { ok: boolean; role: string | null }

    expect(result).toEqual({ ok: false, role: null })
    expect(session.getRole()).toBeNull()
  })

  it('auth:changePin is rejected when the active session role is usuario', () => {
    const db = openMigratedDb()
    const session = createSessionStore()
    session.login('usuario')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerAuthIpc(ipcMain, db, session)

    const changePin = handlers.get('auth:changePin')!

    expect(() => changePin({}, { role: 'usuario', newPin: '2222' })).toThrow()
  })

  it('auth:changePin succeeds for administrador and the new PIN works on next login', () => {
    const db = openMigratedDb()
    const session = createSessionStore()
    session.login('administrador')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerAuthIpc(ipcMain, db, session)

    const changePin = handlers.get('auth:changePin')!
    changePin({}, { role: 'usuario', newPin: '2468' })

    session.logout()
    const login = handlers.get('auth:login')!
    const oldPinResult = login({}, '1111') as { ok: boolean }
    const newPinResult = login({}, '2468') as { ok: boolean; role: string | null }

    expect(oldPinResult.ok).toBe(false)
    expect(newPinResult).toEqual({ ok: true, role: 'usuario' })
  })
})
