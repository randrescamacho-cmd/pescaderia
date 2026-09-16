import type { IpcMain } from 'electron'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import { runMigrations } from '../db/migrate'
import { openShift } from '../db/queries/cash'
import { listDepartments } from '../db/queries/departments'
import { createProduct } from '../db/queries/products'
import { createSale } from '../db/queries/sales'
import { registerPrintIpc } from './print'

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

describe('registerPrintIpc', () => {
  it('wires print:sale, building the sale ticket HTML and delegating to the injected print function', async () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const departmentId = listDepartments(db).find((d) => d.name === 'Mariscos')!.id
    const product = createProduct(db, { name: 'Camaron Grande', price: 120, departmentId })
    const sale = createSale(db, {
      shiftId: shift.id,
      lines: [{ productId: product.id, quantity: 1 }],
      payments: [{ method: 'efectivo', amount: 120 }]
    })
    const printFn = vi.fn().mockResolvedValue({ printed: true })
    const { ipcMain, handlers } = createFakeIpcMain()
    registerPrintIpc(ipcMain, db, printFn)

    const handler = handlers.get('print:sale')!
    const result = await handler({}, sale.id)

    expect(printFn).toHaveBeenCalledTimes(1)
    expect(printFn.mock.calls[0][0]).toContain('Camaron Grande')
    expect(printFn.mock.calls[0][0]).toContain('@page { size: 80mm auto; margin: 0 }')
    expect(result).toEqual({ printed: true })
  })

  it('wires print:dailyCut, building the daily-cut ticket HTML and delegating to the injected print function', async () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const printFn = vi.fn().mockResolvedValue({ printed: true })
    const { ipcMain, handlers } = createFakeIpcMain()
    registerPrintIpc(ipcMain, db, printFn)

    const handler = handlers.get('print:dailyCut')!
    const result = await handler({}, shift.id)

    expect(printFn).toHaveBeenCalledTimes(1)
    expect(printFn.mock.calls[0][0]).toContain('Corte del Dia')
    expect(result).toEqual({ printed: true })
  })

  it('propagates a print failure as a rejected promise (tasks.md 9.6: allow retry without losing saved data)', async () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const printFn = vi.fn().mockRejectedValue(new Error('impresora desconectada'))
    const { ipcMain, handlers } = createFakeIpcMain()
    registerPrintIpc(ipcMain, db, printFn)

    const handler = handlers.get('print:dailyCut')!

    await expect(handler({}, shift.id)).rejects.toThrow('impresora desconectada')
  })
})
