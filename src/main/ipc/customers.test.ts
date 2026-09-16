import type { IpcMain } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../db/migrate'
import { registerCustomersIpc } from './customers'

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

describe('registerCustomersIpc', () => {
  it('wires customers:list without a role guard (needed for the credito picker regardless of role)', async () => {
    const db = openMigratedDb()
    db.prepare('INSERT INTO customers (name) VALUES (?)').run('Dona Rosa')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCustomersIpc(ipcMain, db)

    const handler = handlers.get('customers:list')!

    const customers = (await handler({})) as { name: string }[]
    expect(customers.map((c) => c.name)).toEqual(['Dona Rosa'])
  })
})
