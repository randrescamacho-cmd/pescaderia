import { describe, expect, it } from 'vitest'
import { bufferToBarcode, isBarcodeScan } from './barcode-scanner'

describe('isBarcodeScan', () => {
  it('returns true when every gap between keys is under 50ms (spec: escaneo de producto conocido)', () => {
    const keys = [
      { key: '7', timestamp: 0 },
      { key: '5', timestamp: 10 },
      { key: '0', timestamp: 20 },
      { key: '1', timestamp: 30 }
    ]

    expect(isBarcodeScan(keys)).toBe(true)
  })

  it('returns false when any gap is 50ms or more (design.md: tecleo humano se descarta)', () => {
    const keys = [
      { key: '7', timestamp: 0 },
      { key: '5', timestamp: 10 },
      { key: '0', timestamp: 200 },
      { key: '1', timestamp: 210 }
    ]

    expect(isBarcodeScan(keys)).toBe(false)
  })

  it('returns false for a single keystroke (no gap to measure)', () => {
    expect(isBarcodeScan([{ key: '7', timestamp: 0 }])).toBe(false)
  })

  it('returns false for an empty buffer', () => {
    expect(isBarcodeScan([])).toBe(false)
  })
})

describe('bufferToBarcode', () => {
  it('joins the buffered keys into the scanned barcode string', () => {
    const keys = [
      { key: '7', timestamp: 0 },
      { key: '5', timestamp: 10 },
      { key: '0', timestamp: 20 },
      { key: '1', timestamp: 30 }
    ]

    expect(bufferToBarcode(keys)).toBe('7501')
  })

  it('returns an empty string for an empty buffer', () => {
    expect(bufferToBarcode([])).toBe('')
  })
})
