import { describe, expect, it } from 'vitest'
import {
  computeLineTotal,
  computeSaleTotal,
  paymentsMatchTotal,
  roundToCents,
  sumPaymentAmounts
} from './sale-math'

describe('roundToCents', () => {
  it('rounds a raw float product down to the nearest cent (62.6715 -> 62.67)', () => {
    expect(roundToCents(62.6715)).toBe(62.67)
  })

  it('rounds a raw float product up to the nearest cent (62.70815 -> 62.71)', () => {
    expect(roundToCents(62.70815)).toBe(62.71)
  })

  it('leaves an already-rounded amount unchanged (100.5)', () => {
    expect(roundToCents(100.5)).toBe(100.5)
  })
})

describe('computeLineTotal', () => {
  it('multiplies quantity by unit price', () => {
    expect(computeLineTotal({ quantity: 2, unitPrice: 75 })).toBe(150)
  })

  it('handles fractional quantities (sold by weight)', () => {
    expect(computeLineTotal({ quantity: 1.5, unitPrice: 100 })).toBe(150)
  })

  it('rounds a fractional-weight quantity down to the nearest cent (0.733 kg x $85.50 = $62.6715 raw)', () => {
    expect(computeLineTotal({ quantity: 0.733, unitPrice: 85.5 })).toBe(62.67)
  })

  it('rounds a fractional-weight quantity up to the nearest cent (0.733 kg x $85.55 = $62.70815 raw)', () => {
    expect(computeLineTotal({ quantity: 0.733, unitPrice: 85.55 })).toBe(62.71)
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

  it('accepts a legitimate three-way split that sums exactly via float noise ($11.11 x3 = $33.33)', () => {
    expect(paymentsMatchTotal([{ amount: 11.11 }, { amount: 11.11 }, { amount: 11.11 }], 33.33)).toBe(true)
  })

  it('rejects a shortfall of exactly one cent ($33.32 paid vs $33.33 total)', () => {
    expect(paymentsMatchTotal([{ amount: 33.32 }], 33.33)).toBe(false)
  })

  it('rejects a shortfall of exactly one cent ($199.99 paid vs $200 total)', () => {
    expect(paymentsMatchTotal([{ amount: 199.99 }], 200)).toBe(false)
  })
})
