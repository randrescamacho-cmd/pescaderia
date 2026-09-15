import type { IpcMain } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { createSessionStore } from '../auth/session'
import { runMigrations } from '../db/migrate'
import { registerCatalogIpc } from './catalog'

type Handler = (...args: unknown[]) => unknown

/**
 * Fake minimo de `IpcMain` (solo implementa `.handle`) para poder probar el
 * guard de rol end-to-end (auth-roles/spec.md "Rol Usuario intenta
 * gestionar departamentos") sin necesitar un proceso Electron real. Estas
 * son pruebas de INTEGRACION de la capa de wiring (compone `assertRole`,
 * `createSessionStore` y `db/queries/departments.ts`, ya probados por
 * separado en sus propios `*.test.ts`) -- no sustituyen esas pruebas
 * unitarias, las complementan verificando el cableado real.
 */
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

describe('registerCatalogIpc role guard', () => {
  it('rejects catalog:createDepartment when the active session role is usuario', async () => {
    const db = openMigratedDb()
    const session = createSessionStore()
    session.login('usuario')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCatalogIpc(ipcMain, db, session)

    const handler = handlers.get('catalog:createDepartment')!

    expect(() => handler({}, { name: 'Ferreteria' })).toThrow()
  })

  it('allows catalog:createDepartment when the active session role is administrador', async () => {
    const db = openMigratedDb()
    const session = createSessionStore()
    session.login('administrador')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCatalogIpc(ipcMain, db, session)

    const handler = handlers.get('catalog:createDepartment')!

    const department = (await handler({}, { name: 'Ferreteria' })) as { name: string }
    expect(department.name).toBe('Ferreteria')
  })

  it('does not guard catalog:listDepartments (Usuario role can read the catalog to sell)', async () => {
    const db = openMigratedDb()
    const session = createSessionStore()
    session.login('usuario')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCatalogIpc(ipcMain, db, session)

    const handler = handlers.get('catalog:listDepartments')!

    const departments = (await handler({})) as unknown[]
    expect(departments).toHaveLength(9)
  })
})
