import { describe, expect, it } from 'vitest'
import { computeLineTotal, computeSaleTotal, paymentsMatchTotal, sumPaymentAmounts } from './sale-math'

describe('computeLineTotal', () => {
  it('multiplies quantity by unit price', () => {
    expect(computeLineTotal({ quantity: 2, unitPrice: 75 })).toBe(150)
  })

  it('handles fractional quantities (sold by weight)', () => {
    expect(computeLineTotal({ quantity: 1.5, unitPrice: 100 })).toBe(150)
  })
})

describe('computeSaleTotal', () => {
  it('sums the line totals of a sale with a single line', () => {
    expect(computeSaleTotal([{ quantity: 2, unitPrice: 75 }])).toBe(150)
  })

  it('sums the line totals of a sale with multiple lines (spec: $50 + $30 = $80)', () => {
    expect(computeSaleTotal([{ quantity: 1, unitPrice: 50 }, { quantity: 1, unitPrice: 30 }])).toBe(80)
  })

  it('returns 0 for a sale with no lines', () => {
    expect(computeSaleTotal([])).toBe(0)
  })
})

describe('sumPaymentAmounts', () => {
  it('sums a single payment portion', () => {
    expect(sumPaymentAmounts([{ amount: 150 }])).toBe(150)
  })

  it('sums a split payment (efectivo + tarjeta, spec: $80 + $120 = $200)', () => {
    expect(sumPaymentAmounts([{ amount: 80 }, { amount: 120 }])).toBe(200)
  })
})

describe('paymentsMatchTotal', () => {
  it('returns true when a single cash payment equals the total ($150)', () => {
    expect(paymentsMatchTotal([{ amount: 150 }], 150)).toBe(true)
  })

  it('returns true when split payments sum exactly to the total ($80+$120=$200)', () => {
    expect(paymentsMatchTotal([{ amount: 80 }, { amount: 120 }], 200)).toBe(true)
  })

  it('returns false when payments sum to less than the total (spec: $180 vs $200)', () => {
    expect(paymentsMatchTotal([{ amount: 180 }], 200)).toBe(false)
  })

  it('tolerates float rounding noise within half a cent', () => {
    expect(paymentsMatchTotal([{ amount: 0.1 }, { amount: 0.2 }], 0.3)).toBe(true)
  })
})
