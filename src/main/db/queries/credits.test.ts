import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../migrate'
import { createCustomer } from './customers'
import { openShift } from './cash'
import {
  getCustomerBalance,
  grantCredit,
  listCreditPaymentsForShift,
  listCustomerBalances,
  payCredit,
  sumCreditPaymentsForShift
} from './credits'

function openMigratedDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true })
  runMigrations(db)
  return db
}

describe('grantCredit', () => {
  it('grants credit to an existing customer for a full-sale credito portion (spec: "Otorgar credito a cliente existente")', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const rosa = createCustomer(db, 'Dona Rosa')

    const result = grantCredit(db, { customerId: rosa.id, saleId: null, shiftId: shift.id, amount: 250 })

    expect(result.customer.name).toBe('Dona Rosa')
    expect(result.balance).toBe(250)
    expect(getCustomerBalance(db, rosa.id)).toBe(250)
  })

  it('grants a partial credito portion within a split sale (spec: "Credito parcial dentro de una venta dividida", $100 of $300)', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const beto = createCustomer(db, 'Don Beto')

    grantCredit(db, { customerId: beto.id, saleId: null, shiftId: shift.id, amount: 100 })

    expect(getCustomerBalance(db, beto.id)).toBe(100)
  })

  it('creates a brand-new customer by name when granting credit (spec: "Registrar cliente nuevo al otorgar credito")', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)

    const result = grantCredit(db, {
      customerName: 'Cliente Nuevo',
      saleId: null,
      shiftId: shift.id,
      amount: 180
    })

    expect(result.customer.name).toBe('Cliente Nuevo')
    expect(result.balance).toBe(180)
    expect(getCustomerBalance(db, result.customer.id)).toBe(180)
  })

  it('reuses an existing active customer when granting credit by a name that already matches one (avoids duplicates)', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const beto = createCustomer(db, 'Don Beto')

    const result = grantCredit(db, { customerName: 'Don Beto', saleId: null, shiftId: shift.id, amount: 50 })

    expect(result.customer.id).toBe(beto.id)
  })

  it('accumulates multiple grants into the same balance', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const rosa = createCustomer(db, 'Dona Rosa')

    grantCredit(db, { customerId: rosa.id, saleId: null, shiftId: shift.id, amount: 100 })
    grantCredit(db, { customerId: rosa.id, saleId: null, shiftId: shift.id, amount: 50 })

    expect(getCustomerBalance(db, rosa.id)).toBe(150)
  })

  it('rejects a grant with neither customerId nor customerName', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)

    expect(() => grantCredit(db, { saleId: null, shiftId: shift.id, amount: 100 })).toThrow()
  })

  it('rejects a grant with an amount of zero or less', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const rosa = createCustomer(db, 'Dona Rosa')

    expect(() => grantCredit(db, { customerId: rosa.id, saleId: null, shiftId: shift.id, amount: 0 })).toThrow()
  })
})

describe('getCustomerBalance', () => {
  it('returns 0 for a customer with no credit history', () => {
    const db = openMigratedDb()
    const rosa = createCustomer(db, 'Dona Rosa')

    expect(getCustomerBalance(db, rosa.id)).toBe(0)
  })

  it('computes balance as SUM(customer_credits) - SUM(credit_payments) (design.md formula)', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const rosa = createCustomer(db, 'Dona Rosa')
    grantCredit(db, { customerId: rosa.id, saleId: null, shiftId: shift.id, amount: 250 })
    payCredit(db, { customerId: rosa.id, shiftId: shift.id, amount: 100 })

    expect(getCustomerBalance(db, rosa.id)).toBe(150)
  })
})

describe('payCredit', () => {
  it('reduces the balance by a partial payment (spec: $250 -> pay $100 -> $150)', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const rosa = createCustomer(db, 'Dona Rosa')
    grantCredit(db, { customerId: rosa.id, saleId: null, shiftId: shift.id, amount: 250 })

    const result = payCredit(db, { customerId: rosa.id, shiftId: shift.id, amount: 100 })

    expect(result.balance).toBe(150)
    expect(getCustomerBalance(db, rosa.id)).toBe(150)
  })

  it('rejects a payment greater than the pending balance (spec: balance $80, pay $100 -> rejected; decision: reject, not clamp)', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const cliente = createCustomer(db, 'Cliente Con Saldo Chico')
    grantCredit(db, { customerId: cliente.id, saleId: null, shiftId: shift.id, amount: 80 })

    expect(() => payCredit(db, { customerId: cliente.id, shiftId: shift.id, amount: 100 })).toThrow()
    expect(getCustomerBalance(db, cliente.id)).toBe(80)
  })

  it('accepts a payment exactly equal to the pending balance, leaving balance at 0', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const cliente = createCustomer(db, 'Cliente Al Corriente')
    grantCredit(db, { customerId: cliente.id, saleId: null, shiftId: shift.id, amount: 80 })

    payCredit(db, { customerId: cliente.id, shiftId: shift.id, amount: 80 })

    expect(getCustomerBalance(db, cliente.id)).toBe(0)
  })

  it('rejects a payment for a customer with zero balance', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const cliente = createCustomer(db, 'Cliente Sin Deuda')

    expect(() => payCredit(db, { customerId: cliente.id, shiftId: shift.id, amount: 10 })).toThrow()
  })

  it('rejects a payment of zero or less', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const cliente = createCustomer(db, 'Cliente')
    grantCredit(db, { customerId: cliente.id, saleId: null, shiftId: shift.id, amount: 80 })

    expect(() => payCredit(db, { customerId: cliente.id, shiftId: shift.id, amount: 0 })).toThrow()
  })
})

describe('listCustomerBalances', () => {
  it('lists every active customer with a computed balance, including customers with balance 0', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const rosa = createCustomer(db, 'Dona Rosa')
    createCustomer(db, 'Sin Deuda')
    grantCredit(db, { customerId: rosa.id, saleId: null, shiftId: shift.id, amount: 250 })

    const balances = listCustomerBalances(db)

    expect(balances.find((b) => b.name === 'Dona Rosa')?.balance).toBe(250)
    expect(balances.find((b) => b.name === 'Sin Deuda')?.balance).toBe(0)
  })
})

describe('listCreditPaymentsForShift / sumCreditPaymentsForShift', () => {
  it('returns an empty list and a total of 0 when there were no credit payments this shift (spec: "NO HUBO PAGOS")', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)

    expect(listCreditPaymentsForShift(db, shift.id)).toEqual([])
    expect(sumCreditPaymentsForShift(db, shift.id)).toBe(0)
  })

  it('lists each credit payment with customer name and totals them (spec: two payments $100 + $50 = $150)', () => {
    const db = openMigratedDb()
    const shift = openShift(db, 1, 500)
    const rosa = createCustomer(db, 'Dona Rosa')
    grantCredit(db, { customerId: rosa.id, saleId: null, shiftId: shift.id, amount: 200 })
    payCredit(db, { customerId: rosa.id, shiftId: shift.id, amount: 100 })
    payCredit(db, { customerId: rosa.id, shiftId: shift.id, amount: 50 })

    const payments = listCreditPaymentsForShift(db, shift.id)

    expect(payments.map((p) => ({ customerName: p.customerName, amount: p.amount }))).toEqual([
      { customerName: 'Dona Rosa', amount: 100 },
      { customerName: 'Dona Rosa', amount: 50 }
    ])
    expect(sumCreditPaymentsForShift(db, shift.id)).toBe(150)
  })
})
