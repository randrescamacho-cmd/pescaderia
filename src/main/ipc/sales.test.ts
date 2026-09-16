import type { IpcMain } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { createSessionStore } from '../auth/session'
import { runMigrations } from '../db/migrate'
import { openShift } from '../db/queries/cash'
import { createProduct } from '../db/queries/products'
import { listDepartments } from '../db/queries/departments'
import { registerSalesIpc } from './sales'

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

describe('registerSalesIpc', () => {
  // Nota adversarial (mismo criterio que verify-report-pr2.md WARNING 1 /
  // ipc/catalog.test.ts): el input DEBE ser una venta que de otro modo
  // TENDRIA EXITO (turno abierto real, producto real, pagos que si suman
  // el total) -- si se usara una venta vacia o invalida, el throw vendria
  // de `validateSaleLines`/`validateSalePayments`, no del guard, y el test
  // seria tautologico (pasaria igual aunque se borrara `assertAuthenticated`).
  // Verificado manualmente: comentar la linea del guard hizo que este test
  // siguiera "pasando" con una venta vacia (tautologico) hasta corregirlo a
  // una venta valida, momento en el que remover el guard SI lo hace fallar.
  it('rejects sales:create when there is no active session (guard: cualquier rol autenticado, no anonimo)', () => {
    const db = openMigratedDb()
    const departmentId = listDepartments(db).find((d) => d.name === 'Mariscos')!.id
    const product = createProduct(db, { name: 'Camaron', price: 120, departmentId })
    const shift = openShift(db, 1, 500)
    const session = createSessionStore()
    const { ipcMain, handlers } = createFakeIpcMain()
    registerSalesIpc(ipcMain, db, session)

    const handler = handlers.get('sales:create')!

    expect(() =>
      handler(
        {},
        {
          shiftId: shift.id,
          lines: [{ productId: product.id, quantity: 1 }],
          payments: [{ method: 'efectivo', amount: 120 }]
        }
      )
    ).toThrow()
  })

  it('allows sales:create for the usuario role (venta no es Admin-only)', async () => {
    const db = openMigratedDb()
    const departmentId = listDepartments(db).find((d) => d.name === 'Mariscos')!.id
    const product = createProduct(db, { name: 'Camaron', price: 120, departmentId })
    const shift = openShift(db, 1, 500)
    const session = createSessionStore()
    session.login('usuario')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerSalesIpc(ipcMain, db, session)

    const handler = handlers.get('sales:create')!

    const sale = (await handler({}, {
      shiftId: shift.id,
      lines: [{ productId: product.id, quantity: 1 }],
      payments: [{ method: 'efectivo', amount: 120 }]
    })) as { total: number }

    expect(sale.total).toBe(120)
  })

  it('allows sales:create for the administrador role too', async () => {
    const db = openMigratedDb()
    const departmentId = listDepartments(db).find((d) => d.name === 'Mariscos')!.id
    const product = createProduct(db, { name: 'Camaron', price: 120, departmentId })
    const shift = openShift(db, 1, 500)
    const session = createSessionStore()
    session.login('administrador')
    const { ipcMain, handlers } = createFakeIpcMain()
    registerSalesIpc(ipcMain, db, session)

    const handler = handlers.get('sales:create')!

    const sale = (await handler({}, {
      shiftId: shift.id,
      lines: [{ productId: product.id, quantity: 1 }],
      payments: [{ method: 'efectivo', amount: 120 }]
    })) as { total: number }

    expect(sale.total).toBe(120)
  })
})
