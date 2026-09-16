import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../migrate'
import { listDepartments } from './departments'
import { createProduct } from './products'
import { createCustomer } from './customers'
import { openShift } from './cash'
import { createSale, getSaleById, getSaleTicketData, validateSaleLines, validateSalePayments } from './sales'

function openMigratedDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true })
  runMigrations(db)
  return db
}

function mariscosDepartmentId(db: DatabaseSync): number {
  return listDepartments(db).find((d) => d.name === 'Mariscos')!.id
}

describe('validateSaleLines', () => {
  it('rejects a sale with no lines (spec: "Cerrar venta vacia")', () => {
    const errors = validateSaleLines([])

    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects a line with quantity 0 (spec: "Cantidad invalida")', () => {
    const errors = validateSaleLines([{ productId: 1, quantity: 0 }])

    expect(errors.length).toBeGreaterThan(0)
  })

  it('rejects a line with negative quantity', () => {
    const errors = validateSaleLines([{ productId: 1, quantity: -2 }])

    expect(errors.length).toBeGreaterThan(0)
  })

  it('accepts a sale with at least one line of positive quantity', () => {
    expect(validateSaleLines([{ productId: 1, quantity: 2 }])).toEqual([])
  })
})

describe('validateSalePayments', () => {
  it('rejects payments that sum to less than the total (spec: $180 vs $200)', () => {
    const errors = validateSalePayments([{ method: 'efectivo', amount: 180 }], 200)

    expect(errors.length).toBeGreaterThan(0)
  })

  it('accepts a single efectivo payment that matches the total exactly ($150)', () => {
    expect(validateSalePayments([{ method: 'efectivo', amount: 150 }], 150)).toEqual([])
  })

  it('accepts a split efectivo+tarjeta payment that sums to the total ($80+$120=$200)', () => {
    const errors = validateSalePayments(
      [
        { method: 'efectivo', amount: 80 },
        { method: 'tarjeta', amount: 120 }
      ],
      200
    )

    expect(errors).toEqual([])
  })

  it('rejects a credito portion with no customer selected', () => {
    const errors = validateSalePayments([{ method: 'credito', amount: 150 }], 150)

    expect(errors.length).toBeGreaterThan(0)
  })

  it('accepts a credito portion with a customer selected', () => {
    const errors = validateSalePayments([{ method: 'credito', amount: 150, customerId: 1 }], 150)

    expect(errors).toEqual([])
  })
})

describe('createSale', () => {
  it('rejects an empty sale (no lines)', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)

    expect(() => createSale(db, { shiftId: shift.id, lines: [], payments: [] })).toThrow()
  })

  it('rejects a sale when there is no open shift for the given shiftId', () => {
    const db = openMigratedDb()
    const departmentId = mariscosDepartmentId(db)
    const product = createProduct(db, { name: 'Camaron', price: 100, departmentId })

    expect(() =>
      createSale(db, {
        shiftId: 999,
        lines: [{ productId: product.id, quantity: 1 }],
        payments: [{ method: 'efectivo', amount: 100 }]
      })
    ).toThrow()
  })

  it('rejects payments that do not sum to the total', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const departmentId = mariscosDepartmentId(db)
    const product = createProduct(db, { name: 'Camaron', price: 200, departmentId })

    expect(() =>
      createSale(db, {
        shiftId: shift.id,
        lines: [{ productId: product.id, quantity: 1 }],
        payments: [{ method: 'efectivo', amount: 180 }]
      })
    ).toThrow()
  })

  it('rejects a credito portion without a customer', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const departmentId = mariscosDepartmentId(db)
    const product = createProduct(db, { name: 'Camaron', price: 150, departmentId })

    expect(() =>
      createSale(db, {
        shiftId: shift.id,
        lines: [{ productId: product.id, quantity: 1 }],
        payments: [{ method: 'credito', amount: 150 }]
      })
    ).toThrow()
  })

  it('creates a cash sale with a single line, snapshotting price/cost/department', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const departmentId = mariscosDepartmentId(db)
    const product = createProduct(db, { name: 'Camaron', price: 120, cost: 80, departmentId })

    const sale = createSale(db, {
      shiftId: shift.id,
      lines: [{ productId: product.id, quantity: 2 }],
      payments: [{ method: 'efectivo', amount: 240 }]
    })

    expect(sale.total).toBe(240)
    expect(sale.lines).toHaveLength(1)
    expect(sale.lines[0].unitPrice).toBe(120)
    expect(sale.lines[0].unitCost).toBe(80)
    expect(sale.lines[0].departmentId).toBe(departmentId)
    expect(sale.lines[0].lineTotal).toBe(240)
    expect(sale.payments).toEqual([
      expect.objectContaining({ method: 'efectivo', amount: 240, customerId: null })
    ])
  })

  it('rounds line_total to cents for a fractional quantity sold by weight (0.733 kg x $85.55 = $62.70815 raw)', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const departmentId = mariscosDepartmentId(db)
    const product = createProduct(db, { name: 'Camaron a granel', price: 85.55, departmentId })

    const sale = createSale(db, {
      shiftId: shift.id,
      lines: [{ productId: product.id, quantity: 0.733 }],
      payments: [{ method: 'efectivo', amount: 62.71 }]
    })

    expect(sale.lines[0].lineTotal).toBe(62.71)
    expect(sale.total).toBe(62.71)
  })

  it('creates a sale with multiple lines totaling the sum of subtotals ($50+$30=$80)', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const departmentId = mariscosDepartmentId(db)
    const productA = createProduct(db, { name: 'Producto A', price: 50, departmentId })
    const productB = createProduct(db, { name: 'Producto B', price: 30, departmentId })

    const sale = createSale(db, {
      shiftId: shift.id,
      lines: [
        { productId: productA.id, quantity: 1 },
        { productId: productB.id, quantity: 1 }
      ],
      payments: [{ method: 'efectivo', amount: 80 }]
    })

    expect(sale.total).toBe(80)
    expect(sale.lines).toHaveLength(2)
  })

  it('creates a split payment sale (efectivo $80 + tarjeta $120 = $200)', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const departmentId = mariscosDepartmentId(db)
    const product = createProduct(db, { name: 'Refresco', price: 200, departmentId })

    const sale = createSale(db, {
      shiftId: shift.id,
      lines: [{ productId: product.id, quantity: 1 }],
      payments: [
        { method: 'efectivo', amount: 80 },
        { method: 'tarjeta', amount: 120 }
      ]
    })

    expect(sale.total).toBe(200)
    expect(sale.payments).toHaveLength(2)
  })

  it('creates a sale with a credito portion linked to an existing customer', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const departmentId = mariscosDepartmentId(db)
    const product = createProduct(db, { name: 'Camaron', price: 250, departmentId })
    const customerResult = db.prepare('INSERT INTO customers (name) VALUES (?)').run('Dona Rosa')
    const customerId = Number(customerResult.lastInsertRowid)

    const sale = createSale(db, {
      shiftId: shift.id,
      lines: [{ productId: product.id, quantity: 1 }],
      payments: [{ method: 'credito', amount: 250, customerId }]
    })

    expect(sale.payments).toEqual([
      expect.objectContaining({ method: 'credito', amount: 250, customerId })
    ])
  })

  it('rolls back the whole transaction when a line references a nonexistent product', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)

    expect(() =>
      createSale(db, {
        shiftId: shift.id,
        lines: [{ productId: 999999, quantity: 1 }],
        payments: [{ method: 'efectivo', amount: 100 }]
      })
    ).toThrow()

    expect(getOpenSalesCount(db)).toBe(0)
  })
})

function getOpenSalesCount(db: DatabaseSync): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM sales').get() as { count: number }
  return row.count
}

describe('getSaleTicketData', () => {
  it('enriches sale lines with product names and payments with customer names (Fase 9, ticket printing)', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const departmentId = mariscosDepartmentId(db)
    const product = createProduct(db, { name: 'Camaron Grande', price: 120, departmentId })
    const rosa = createCustomer(db, 'Dona Rosa')
    const sale = createSale(db, {
      shiftId: shift.id,
      lines: [{ productId: product.id, quantity: 2 }],
      payments: [
        { method: 'efectivo', amount: 140 },
        { method: 'credito', amount: 100, customerId: rosa.id }
      ]
    })

    const ticket = getSaleTicketData(db, sale.id)

    expect(ticket.total).toBe(sale.total)
    expect(ticket.lines).toEqual([
      { productName: 'Camaron Grande', quantity: 2, unitPrice: 120, lineTotal: 240 }
    ])
    expect(ticket.payments).toEqual([
      { method: 'efectivo', amount: 140, customerName: null },
      { method: 'credito', amount: 100, customerName: 'Dona Rosa' }
    ])
  })

  it('throws for a nonexistent sale id', () => {
    const db = openMigratedDb()

    expect(() => getSaleTicketData(db, 999999)).toThrow()
  })
})

describe('getSaleById', () => {
  it('retrieves a previously created sale with its lines and payments', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const departmentId = mariscosDepartmentId(db)
    const product = createProduct(db, { name: 'Camaron', price: 120, departmentId })
    const created = createSale(db, {
      shiftId: shift.id,
      lines: [{ productId: product.id, quantity: 1 }],
      payments: [{ method: 'efectivo', amount: 120 }]
    })

    const fetched = getSaleById(db, created.id)

    expect(fetched.id).toBe(created.id)
    expect(fetched.lines).toHaveLength(1)
    expect(fetched.payments).toHaveLength(1)
  })
})
