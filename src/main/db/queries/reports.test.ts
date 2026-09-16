import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../migrate'
import { cashIn, cashOut, closeShift, openShift } from './cash'
import { grantCredit, payCredit } from './credits'
import { createCustomer } from './customers'
import { listDepartments } from './departments'
import { createProduct } from './products'
import { createSale } from './sales'
import { computeProfit, computeTotalSales, getDailyCutReport } from './reports'

function openMigratedDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true })
  runMigrations(db)
  return db
}

function departmentId(db: DatabaseSync, name: string): number {
  return listDepartments(db).find((d) => d.name === name)!.id
}

describe('computeProfit', () => {
  it('computes profit as quantity * (price - cost) for a fully-costed line', () => {
    const result = computeProfit([{ productId: 1, quantity: 2, unitPrice: 100, unitCost: 60 }])

    expect(result.profit).toBe(80)
    expect(result.uncostedProductCount).toBe(0)
  })

  it('treats a missing cost (null) as 0 and flags the product as uncosted (spec: "Ganancia del dia con producto sin costo")', () => {
    const result = computeProfit([{ productId: 7, quantity: 3, unitPrice: 50, unitCost: null }])

    expect(result.profit).toBe(150)
    expect(result.uncostedProductCount).toBe(1)
  })

  it('counts uncosted products as DISTINCT products, not per line (same product sold twice)', () => {
    const result = computeProfit([
      { productId: 7, quantity: 1, unitPrice: 50, unitCost: null },
      { productId: 7, quantity: 2, unitPrice: 50, unitCost: null }
    ])

    expect(result.uncostedProductCount).toBe(1)
  })

  it('sums profit across mixed costed/uncosted lines ($80 costed + $150 uncosted = $230)', () => {
    const result = computeProfit([
      { productId: 1, quantity: 2, unitPrice: 100, unitCost: 60 },
      { productId: 7, quantity: 3, unitPrice: 50, unitCost: null }
    ])

    expect(result.profit).toBe(230)
    expect(result.uncostedProductCount).toBe(1)
  })

  it('returns 0 profit and 0 uncosted count for a shift with no sale lines', () => {
    expect(computeProfit([])).toEqual({ profit: 0, uncostedProductCount: 0 })
  })
})

describe('computeTotalSales', () => {
  it('sums cash+card sales with credit payments collected this shift (spec: "ventas de contado + pagos de clientes")', () => {
    expect(computeTotalSales(1050, 150)).toBe(1200)
  })

  it('equals cash sales alone when there were no credit payments this shift', () => {
    expect(computeTotalSales(900, 0)).toBe(900)
  })
})

describe('getDailyCutReport', () => {
  it('presents the 9 sections in the exact fixed order for a shift with full activity', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    cashIn(db, shift.id, 200, 'cambio')
    cashOut(db, shift.id, 300, 'compra de hielo', 'Hielera del Puerto')

    const mariscos = departmentId(db, 'Mariscos')
    const souvenir = departmentId(db, 'Souvenir')
    const productoConCosto = createProduct(db, { name: 'Camaron', price: 100, cost: 60, departmentId: mariscos })
    const productoSinCosto = createProduct(db, { name: 'Llavero', price: 50, departmentId: souvenir })

    createSale(db, {
      shiftId: shift.id,
      lines: [{ productId: productoConCosto.id, quantity: 2 }],
      payments: [{ method: 'efectivo', amount: 200 }]
    })
    createSale(db, {
      shiftId: shift.id,
      lines: [{ productId: productoSinCosto.id, quantity: 3 }],
      payments: [{ method: 'tarjeta', amount: 150 }]
    })

    const rosa = createCustomer(db, 'Dona Rosa')
    grantCredit(db, { customerId: rosa.id, saleId: null, shiftId: shift.id, amount: 300 })
    payCredit(db, { customerId: rosa.id, shiftId: shift.id, amount: 100 })
    payCredit(db, { customerId: rosa.id, shiftId: shift.id, amount: 50 })

    const report = getDailyCutReport(db, shift.id)

    // 1. Entradas efectivo = inicio de caja ($500) + entradas de cambio ($200) = $700
    expect(report.cashEntriesTotal).toBe(700)
    // 2. Ventas de contado = efectivo ($200) + tarjeta ($150) = $350 (excluye credito)
    expect(report.cashSalesTotal).toBe(350)
    // 3. Salidas/Proveedores = $300
    expect(report.supplierPaymentsTotal).toBe(300)
    // 4. Dinero en caja = entradas efectivo ($700) + ventas efectivo ($200) - salidas ($300) = $600
    expect(report.cashOnHand).toBe(600)
    // 5. Dinero en bancos (tarjeta) = $150
    expect(report.bankTotal).toBe(150)
    // 6. Ventas totales = ventas de contado ($350) + pagos de creditos ($150) = $500
    expect(report.totalSales).toBe(500)
    // 7. Ganancia del dia = (100-60)*2 + (50-0)*3 = 80 + 150 = 230, con advertencia de 1 producto sin costo
    expect(report.profit).toBe(230)
    expect(report.uncostedProductCount).toBe(1)
    // 8. Pagos de creditos = $100 + $50 = $150
    expect(report.creditPaymentsTotal).toBe(150)
    expect(report.creditPayments).toHaveLength(2)
    // 9. Ventas por departamento
    const mariscosLine = report.departmentSales.find((d) => d.departmentName === 'Mariscos')
    const souvenirLine = report.departmentSales.find((d) => d.departmentName === 'Souvenir')
    expect(mariscosLine?.total).toBe(200)
    expect(souvenirLine?.total).toBe(150)

    expect(report.shiftStatus).toBe('open')
    expect(report.isPreview).toBe(true)
  })

  it('shows "NO HUBO PAGOS" state (empty list, total 0) when there were no credit payments this shift', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)

    const report = getDailyCutReport(db, shift.id)

    expect(report.creditPayments).toEqual([])
    expect(report.creditPaymentsTotal).toBe(0)
  })

  it('marks isPreview false and shiftStatus closed for a closed shift', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    closeShift(db, shift.id, 1, 500)

    const report = getDailyCutReport(db, shift.id)

    expect(report.shiftStatus).toBe('closed')
    expect(report.isPreview).toBe(false)
  })

  it('reproduces the tasks.md 6.4 reconciliation example exactly ($700+$900-$300=$1,300)', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 700)
    cashOut(db, shift.id, 300, 'compra de hielo', 'Hielera del Puerto')
    const mariscos = departmentId(db, 'Mariscos')
    const product = createProduct(db, { name: 'Camaron', price: 900, departmentId: mariscos })
    createSale(db, {
      shiftId: shift.id,
      lines: [{ productId: product.id, quantity: 1 }],
      payments: [{ method: 'efectivo', amount: 900 }]
    })

    const report = getDailyCutReport(db, shift.id)

    expect(report.cashOnHand).toBe(1300)
  })

  it('rounds cashOnHand to exact cents even with fractional cash sales that produce floating-point residue (same pattern as the PR3 CRITICAL fix, WARNING-1 verify-report-pr4.md)', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500.35)
    cashOut(db, shift.id, 300.1, 'compra de hielo', 'Hielera del Puerto')

    const mariscos = departmentId(db, 'Mariscos')
    const camaron = createProduct(db, { name: 'Camaron', price: 62.71, departmentId: mariscos })
    const pulpo = createProduct(db, { name: 'Pulpo', price: 85.55, departmentId: mariscos })
    const ceviche = createProduct(db, { name: 'Ceviche', price: 33.33, departmentId: mariscos })

    createSale(db, {
      shiftId: shift.id,
      lines: [{ productId: camaron.id, quantity: 1 }],
      payments: [{ method: 'efectivo', amount: 62.71 }]
    })
    createSale(db, {
      shiftId: shift.id,
      lines: [{ productId: pulpo.id, quantity: 1 }],
      payments: [{ method: 'efectivo', amount: 85.55 }]
    })
    createSale(db, {
      shiftId: shift.id,
      lines: [{ productId: ceviche.id, quantity: 1 }],
      payments: [{ method: 'efectivo', amount: 33.33 }]
    })

    const report = getDailyCutReport(db, shift.id)

    // 500.35 + 0 (sin entradas de cambio) + (62.71+85.55+33.33) - 300.10 = 381.84
    // exacto en aritmetica decimal; en floats JS/SQLite deja 381.84000000000003
    // sin roundToCents (reproducido en Node: 500.35+0+(62.71+85.55+33.33)-300.10).
    expect(report.cashOnHand).toBe(381.84)
  })

  it('throws for a nonexistent shift id', () => {
    const db = openMigratedDb()

    expect(() => getDailyCutReport(db, 999999)).toThrow()
  })

  it('omits departments with no sales this shift (spec: "Departamentos sin ventas ese dia MAY omitirse")', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)

    const report = getDailyCutReport(db, shift.id)

    expect(report.departmentSales).toEqual([])
  })
})
