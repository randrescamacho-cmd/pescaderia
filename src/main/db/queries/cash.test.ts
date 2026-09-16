import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../migrate'
import {
  cashIn,
  cashOut,
  closeShift,
  computeExpectedCash,
  getOpenShift,
  listCashMovements,
  openShift,
  validateCashOutInput
} from './cash'

function openMigratedDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true })
  runMigrations(db)
  return db
}

describe('computeExpectedCash', () => {
  it('computes the reconciliation formula from design.md ($500+$200+$0-$0=$700)', () => {
    expect(
      computeExpectedCash({ openingCash: 500, cashInTotal: 200, cashSalesTotal: 0, cashOutTotal: 0 })
    ).toBe(700)
  })

  it('computes the tasks.md 6.4 example ($700 + $900 - $300 = $1,300)', () => {
    expect(
      computeExpectedCash({ openingCash: 700, cashInTotal: 0, cashSalesTotal: 900, cashOutTotal: 300 })
    ).toBe(1300)
  })
})

describe('validateCashOutInput', () => {
  it('rejects a salida with no concept and no provider', () => {
    const errors = validateCashOutInput({ concept: '', provider: '' })

    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects a salida with a provider but no concept', () => {
    const errors = validateCashOutInput({ concept: '', provider: 'Hielera del Puerto' })

    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects a salida with a concept but no provider', () => {
    const errors = validateCashOutInput({ concept: 'compra de hielo', provider: '' })

    expect(errors.length).toBeGreaterThan(0)
  })

  it('accepts a salida with both concept and provider', () => {
    expect(validateCashOutInput({ concept: 'compra de hielo', provider: 'Hielera del Puerto' })).toEqual([])
  })
})

describe('openShift', () => {
  it('opens a shift with the given initial amount', () => {
    const db = openMigratedDb()

    const shift = openShift(db, 1, 500)

    expect(shift.openingCash).toBe(500)
    expect(shift.status).toBe('open')
  })

  it('rejects opening a second shift while one is already open (spec: "Intentar abrir un segundo turno")', () => {
    const db = openMigratedDb()
    openShift(db, 1, 500)

    expect(() => openShift(db, 1, 300)).toThrow()
  })

  it('allows opening a new shift after the previous one was closed', () => {
    const db = openMigratedDb()
    const first = openShift(db, 1, 500)
    closeShift(db, first.id, 1, 500)

    expect(() => openShift(db, 1, 300)).not.toThrow()
  })
})

describe('getOpenShift', () => {
  it('returns null when there is no open shift', () => {
    const db = openMigratedDb()

    expect(getOpenShift(db)).toBeNull()
  })

  it('returns the currently open shift', () => {
    const db = openMigratedDb()
    const opened = openShift(db, 1, 500)

    expect(getOpenShift(db)?.id).toBe(opened.id)
  })
})

describe('cashIn', () => {
  it('registers a cash-in entry with amount and concept (spec: entrada de cambio $200)', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)

    const movement = cashIn(db, shift.id, 200, 'cambio')

    expect(movement.type).toBe('entrada')
    expect(movement.amount).toBe(200)
    expect(movement.concept).toBe('cambio')
  })

  it('rejects a cash-in entry without a concept', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)

    expect(() => cashIn(db, shift.id, 200, '')).toThrow()
  })
})

describe('cashOut', () => {
  it('registers a cash-out with amount, concept and provider (spec: pago a proveedor $300)', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)

    const movement = cashOut(db, shift.id, 300, 'compra de hielo', 'Hielera del Puerto')

    expect(movement.type).toBe('salida')
    expect(movement.amount).toBe(300)
    expect(movement.provider).toBe('Hielera del Puerto')
  })

  it('rejects a cash-out without a concept or provider', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)

    expect(() => cashOut(db, shift.id, 300, '', '')).toThrow()
  })
})

describe('listCashMovements', () => {
  it('lists entradas and salidas for a shift in insertion order', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    cashIn(db, shift.id, 200, 'cambio')
    cashOut(db, shift.id, 300, 'compra de hielo', 'Hielera del Puerto')

    const movements = listCashMovements(db, shift.id)

    expect(movements.map((m) => m.type)).toEqual(['entrada', 'salida'])
  })
})

describe('closeShift', () => {
  it('closes without difference when counted cash matches expected cash', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 1200)

    const result = closeShift(db, shift.id, 1, 1200)

    expect(result.expectedCash).toBe(1200)
    expect(result.difference).toBe(0)
    expect(result.shift.status).toBe('closed')
  })

  it('reports a shortage (faltante) when counted cash is less than expected (spec: -$50)', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 1200)

    const result = closeShift(db, shift.id, 1, 1150)

    expect(result.difference).toBe(-50)
  })

  it('computes expected cash from opening + entradas + ventas efectivo - salidas (tasks.md 6.4: $700+$900-$300=$1,300)', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 700)
    cashOut(db, shift.id, 300, 'compra de hielo', 'Hielera del Puerto')
    // Simula $900 de ventas en efectivo directamente en sale_payments,
    // sin pasar por createSale (sales.ts depende de openShift, no al reves --
    // se prueba la integracion real venta+caja en sales.test.ts).
    db.prepare("INSERT INTO sales (shift_id, subtotal, total) VALUES (?, 900, 900)").run(shift.id)
    const saleId = db.prepare('SELECT id FROM sales WHERE shift_id = ?').get(shift.id) as { id: number }
    db.prepare("INSERT INTO sale_payments (sale_id, method, amount) VALUES (?, 'efectivo', 900)").run(
      saleId.id
    )

    const result = closeShift(db, shift.id, 1, 1300)

    expect(result.expectedCash).toBe(1300)
    expect(result.difference).toBe(0)
  })
})
