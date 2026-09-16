import type { DatabaseSync } from 'node:sqlite'
import type { CashMovement, Shift } from '../../../shared/ipc-types'

interface ShiftRow {
  id: number
  opened_at: string
  closed_at: string | null
  opened_by_role_id: number
  closed_by_role_id: number | null
  opening_cash: number
  closing_cash_counted: number | null
  status: 'open' | 'closed'
}

interface CashMovementRow {
  id: number
  shift_id: number
  type: 'entrada' | 'salida'
  concept: string
  provider: string | null
  amount: number
  created_at: string
}

function mapShift(row: ShiftRow): Shift {
  return {
    id: row.id,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    openedByRoleId: row.opened_by_role_id,
    closedByRoleId: row.closed_by_role_id,
    openingCash: row.opening_cash,
    closingCashCounted: row.closing_cash_counted,
    status: row.status
  }
}

function mapMovement(row: CashMovementRow): CashMovement {
  return {
    id: row.id,
    shiftId: row.shift_id,
    type: row.type,
    concept: row.concept,
    provider: row.provider,
    amount: row.amount,
    createdAt: row.created_at
  }
}

/**
 * cash-register/spec.md "Shift Opening with Initial Amount": MUST NOT
 * existir mas de un turno abierto simultaneamente.
 */
export function getOpenShift(db: DatabaseSync): Shift | null {
  const row = db.prepare("SELECT * FROM shifts WHERE status = 'open'").get() as unknown as
    | ShiftRow
    | undefined

  return row ? mapShift(row) : null
}

/**
 * Rechaza abrir un segundo turno mientras exista uno abierto
 * (cash-register/spec.md "Intentar abrir un segundo turno").
 */
export function openShift(db: DatabaseSync, openedByRoleId: number, openingCash: number): Shift {
  if (getOpenShift(db)) {
    throw new Error('Ya existe un turno de caja abierto; cierra el turno actual antes de abrir otro')
  }

  const result = db
    .prepare('INSERT INTO shifts (opened_by_role_id, opening_cash) VALUES (?, ?)')
    .run(openedByRoleId, openingCash)

  return mapShift(
    db.prepare('SELECT * FROM shifts WHERE id = ?').get(result.lastInsertRowid) as unknown as ShiftRow
  )
}

/**
 * cash-register/spec.md "Cash-In Entries": monto + motivo obligatorios.
 */
export function cashIn(db: DatabaseSync, shiftId: number, amount: number, concept: string): CashMovement {
  if (!concept || !concept.trim()) {
    throw new Error('El motivo de la entrada es obligatorio')
  }

  const result = db
    .prepare("INSERT INTO cash_movements (shift_id, type, concept, amount) VALUES (?, 'entrada', ?, ?)")
    .run(shiftId, concept, amount)

  return mapMovement(
    db
      .prepare('SELECT * FROM cash_movements WHERE id = ?')
      .get(result.lastInsertRowid) as unknown as CashMovementRow
  )
}

/**
 * Validacion pura (cash-register/spec.md "Salida sin motivo ni proveedor"):
 * separada de `cashOut` para poder testearla sin SQLite, mismo criterio que
 * `validateProductInput` en `products.ts`.
 */
export function validateCashOutInput(input: { concept: string; provider: string }): string[] {
  const errors: string[] = []

  if (!input.concept || !input.concept.trim()) {
    errors.push('el motivo es obligatorio')
  }
  if (!input.provider || !input.provider.trim()) {
    errors.push('el proveedor es obligatorio')
  }

  return errors
}

/**
 * cash-register/spec.md "Cash-Out to Suppliers": monto + motivo + proveedor
 * obligatorios.
 */
export function cashOut(
  db: DatabaseSync,
  shiftId: number,
  amount: number,
  concept: string,
  provider: string
): CashMovement {
  const errors = validateCashOutInput({ concept, provider })
  if (errors.length > 0) {
    throw new Error(`Salida invalida: ${errors.join(', ')}`)
  }

  const result = db
    .prepare(
      "INSERT INTO cash_movements (shift_id, type, concept, provider, amount) VALUES (?, 'salida', ?, ?, ?)"
    )
    .run(shiftId, concept, provider, amount)

  return mapMovement(
    db
      .prepare('SELECT * FROM cash_movements WHERE id = ?')
      .get(result.lastInsertRowid) as unknown as CashMovementRow
  )
}

export function listCashMovements(db: DatabaseSync, shiftId: number): CashMovement[] {
  const rows = db
    .prepare('SELECT * FROM cash_movements WHERE shift_id = ? ORDER BY id')
    .all(shiftId) as unknown as CashMovementRow[]

  return rows.map(mapMovement)
}

interface ExpectedCashInputs {
  openingCash: number
  cashInTotal: number
  cashSalesTotal: number
  cashOutTotal: number
}

/**
 * Formula de conciliacion (design.md "Dinero en caja" / cash-register/spec.md
 * "Cash Reconciliation at Close"): inicio de caja + entradas de efectivo +
 * ventas en efectivo - salidas. Funcion pura para poder triangular sin
 * SQLite (tasks.md 6.4).
 */
export function computeExpectedCash(inputs: ExpectedCashInputs): number {
  return inputs.openingCash + inputs.cashInTotal + inputs.cashSalesTotal - inputs.cashOutTotal
}

function getShiftCashSummary(
  db: DatabaseSync,
  shiftId: number
): { cashInTotal: number; cashOutTotal: number; cashSalesTotal: number } {
  const cashInTotal = (
    db
      .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM cash_movements WHERE shift_id = ? AND type = 'entrada'")
      .get(shiftId) as { total: number }
  ).total

  const cashOutTotal = (
    db
      .prepare("SELECT COALESCE(SUM(amount), 0) as total FROM cash_movements WHERE shift_id = ? AND type = 'salida'")
      .get(shiftId) as { total: number }
  ).total

  const cashSalesTotal = (
    db
      .prepare(
        `SELECT COALESCE(SUM(sp.amount), 0) as total
         FROM sale_payments sp
         JOIN sales s ON s.id = sp.sale_id
         WHERE s.shift_id = ? AND sp.method = 'efectivo'`
      )
      .get(shiftId) as { total: number }
  ).total

  return { cashInTotal, cashOutTotal, cashSalesTotal }
}

export interface CloseShiftResult {
  shift: Shift
  expectedCash: number
  countedCash: number
  difference: number
}

/**
 * cash-register/spec.md "Cash Reconciliation at Close": calcula el dinero
 * esperado, acepta el dinero contado y muestra/persiste la diferencia. La
 * diferencia MUST permitir cerrar el turno igualmente ("Cierre con
 * faltante") -- no se rechaza el cierre por tener diferencia.
 */
export function closeShift(
  db: DatabaseSync,
  shiftId: number,
  closedByRoleId: number,
  countedCash: number
): CloseShiftResult {
  const shiftRow = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId) as unknown as
    | ShiftRow
    | undefined

  if (!shiftRow || shiftRow.status !== 'open') {
    throw new Error('El turno no existe o ya esta cerrado')
  }

  const summary = getShiftCashSummary(db, shiftId)
  const expectedCash = computeExpectedCash({
    openingCash: shiftRow.opening_cash,
    cashInTotal: summary.cashInTotal,
    cashSalesTotal: summary.cashSalesTotal,
    cashOutTotal: summary.cashOutTotal
  })

  db.prepare(
    `UPDATE shifts
     SET closed_at = datetime('now'), closed_by_role_id = ?, closing_cash_counted = ?, status = 'closed'
     WHERE id = ?`
  ).run(closedByRoleId, countedCash, shiftId)

  const updated = mapShift(
    db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId) as unknown as ShiftRow
  )

  return { shift: updated, expectedCash, countedCash, difference: countedCash - expectedCash }
}
