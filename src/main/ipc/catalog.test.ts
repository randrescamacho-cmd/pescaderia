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

  // PR2 follow-up (verify-report-pr2.md WARNING 1): solo catalog:createDepartment
  // tenia un test de guard a nivel de wiring IPC. Los otros 5 canales mutantes
  // comparten el mismo patron assertRole(...) pero no tenian un test dedicado
  // que invocara el canal real y confirmara el rechazo. Estos 5 tests usan IDs
  // reales (departamento 1, sembrado por la migracion 3:seed_departments; y un
  // producto creado en el propio test) para que, si alguien borra la linea
  // assertRole(...) de un handler, la operacion SUCEDA sin lanzar (porque el
  // ID es valido y la mutacion es legitima) y el test falle -- no son
  // tautologicos.
  it('rejects catalog:updateDepartment when the active session role is usuario', () => {
    const db = openMigratedDb()
    const session = createSessionStore()
    session.login('usuario')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCatalogIpc(ipcMain, db, session)

    const handler = handlers.get('catalog:updateDepartment')!

    expect(() => handler({}, 1, { name: 'Ferreteria' })).toThrow()
  })

  it('rejects catalog:deleteDepartment when the active session role is usuario', () => {
    const db = openMigratedDb()
    const session = createSessionStore()
    session.login('usuario')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCatalogIpc(ipcMain, db, session)

    const handler = handlers.get('catalog:deleteDepartment')!

    expect(() => handler({}, 1)).toThrow()
  })

  it('rejects catalog:createProduct when the active session role is usuario', () => {
    const db = openMigratedDb()
    const session = createSessionStore()
    session.login('usuario')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCatalogIpc(ipcMain, db, session)

    const handler = handlers.get('catalog:createProduct')!

    expect(() => handler({}, { name: 'Camaron', price: 100, departmentId: 1 })).toThrow()
  })

  it('rejects catalog:updateProduct when the active session role is usuario (Reasignar producto a otro departamento)', async () => {
    const db = openMigratedDb()
    const session = createSessionStore()
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCatalogIpc(ipcMain, db, session)

    session.login('administrador')
    const createProduct = handlers.get('catalog:createProduct')!
    const product = (await createProduct({}, {
      name: 'Camaron',
      price: 120,
      departmentId: 1
    })) as { id: number }

    session.login('usuario')
    const updateProduct = handlers.get('catalog:updateProduct')!

    expect(() =>
      updateProduct({}, product.id, { name: 'Camaron', price: 120, departmentId: 2 })
    ).toThrow()
  })

  it('rejects catalog:deleteProduct when the active session role is usuario', async () => {
    const db = openMigratedDb()
    const session = createSessionStore()
    const { ipcMain, handlers } = createFakeIpcMain()
    registerCatalogIpc(ipcMain, db, session)

    session.login('administrador')
    const createProduct = handlers.get('catalog:createProduct')!
    const product = (await createProduct({}, {
      name: 'Souvenir llavero',
      price: 50,
      departmentId: 1
    })) as { id: number }

    session.login('usuario')
    const deleteProduct = handlers.get('catalog:deleteProduct')!

    expect(() => deleteProduct({}, product.id)).toThrow()
  })
})
