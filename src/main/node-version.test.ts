import { describe, expect, it } from 'vitest'
import { needsExperimentalSqliteFlag } from './node-version'

// Task 1.5: node:sqlite fue experimental-detras-de-flag hasta Node 22.13.0 /
// 23.4.0 (ver https://nodejs.org/api/sqlite.html). Electron 44.x empaqueta
// Node 24.20.0, muy por encima de ese umbral, pero esta funcion queda como
// guardia defensiva por si la version de Electron/Node bundle cambia.
describe('needsExperimentalSqliteFlag', () => {
  it('requires the flag on Node 22.5.0 (primera version con node:sqlite, detras de flag)', () => {
    expect(needsExperimentalSqliteFlag('v22.5.0')).toBe(true)
  })

  it('does NOT require the flag on Node 22.13.0 (limite exacto donde se quito el flag en la linea 22.x)', () => {
    expect(needsExperimentalSqliteFlag('v22.13.0')).toBe(false)
  })

  it('does NOT require the flag on Node 23.4.0 (limite exacto donde se quito el flag en la linea 23.x)', () => {
    expect(needsExperimentalSqliteFlag('v23.4.0')).toBe(false)
  })

  it('requires the flag on Node 23.3.9 (justo antes del limite en la linea 23.x)', () => {
    expect(needsExperimentalSqliteFlag('v23.3.9')).toBe(true)
  })

  it('does NOT require the flag on Node 24.20.0 (version real que empaqueta Electron 44.3.0)', () => {
    expect(needsExperimentalSqliteFlag('v24.20.0')).toBe(false)
  })
})
