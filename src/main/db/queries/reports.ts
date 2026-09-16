import type { DatabaseSync } from 'node:sqlite'
import type { DailyCutReport, DepartmentSalesLine } from '../../../shared/ipc-types'
import { roundToCents } from '../../../shared/sale-math'
import { computeExpectedCash, getShiftById, getShiftCashSummary, listCashMovements } from './cash'
import { listCreditPaymentsForShift, sumCreditPaymentsForShift } from './credits'

export interface ProfitLineInput {
  productId: number
  quantity: number
  unitPrice: number
  unitCost: number | null
}

export interface ProfitResult {
  profit: number
  uncostedProductCount: number
}

/**
 * "Ganancia del dia" (design.md formula, daily-report/spec.md Scenario
 * "Ganancia del dia con producto sin costo"): SUM(quantity*(price-cost)),
 * costo faltante (NULL, ver PR1 Deviation de `sale_lines.unit_cost`
 * NULLABLE) tratado como 0. `uncostedProductCount` cuenta PRODUCTOS
 * distintos con costo faltante (no lineas de venta) para la advertencia
 * visible (tasks.md 8.2) -- vender el mismo producto sin costo varias veces
 * en el turno no debe inflar el numero mostrado al cajero.
 */
export function computeProfit(lines: ProfitLineInput[]): ProfitResult {
  let profit = 0
  const uncostedProductIds = new Set<number>()

  for (const line of lines) {
    const cost = line.unitCost ?? 0
    profit += line.quantity * (line.unitPrice - cost)
    if (line.unitCost === null) {
      uncostedProductIds.add(line.productId)
    }
  }

  return { profit: roundToCents(profit), uncostedProductCount: uncostedProductIds.size }
}

/**
 * "Ventas totales" (daily-report/spec.md "Section Formulas": "ventas de
 * contado + pagos de clientes (creditos) = total"). DEVIATION deliberada
 * vs. la sugerencia SQL de design.md (`SUM(sales.total)`, que incluiria el
 * valor de ventas a CREDITO recien otorgadas como si fueran dinero ya
 * recibido) -- ver apply-progress.md "Fase 8: decision Ventas totales" para
 * la justificacion completa de por que se sigue el texto literal de
 * spec.md (fuente de verdad RFC2119) en vez del hint SQL de design.md.
 */
export function computeTotalSales(cashSalesTotal: number, creditPaymentsTotal: number): number {
  return roundToCents(cashSalesTotal + creditPaymentsTotal)
}

interface SalePaymentTotalRow {
  total: number
}

function sumSalePaymentsForShift(db: DatabaseSync, shiftId: number, methods: string[]): number {
  const placeholders = methods.map(() => '?').join(', ')
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(sp.amount), 0) as total
       FROM sale_payments sp
       JOIN sales s ON s.id = sp.sale_id
       WHERE s.shift_id = ? AND sp.method IN (${placeholders})`
    )
    .get(shiftId, ...methods) as unknown as SalePaymentTotalRow

  return roundToCents(row.total)
}

interface SaleLineForProfitRow {
  product_id: number
  quantity: number
  unit_price: number
  unit_cost: number | null
}

function getSaleLinesForShift(db: DatabaseSync, shiftId: number): ProfitLineInput[] {
  const rows = db
    .prepare(
      `SELECT sl.product_id, sl.quantity, sl.unit_price, sl.unit_cost
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
       WHERE s.shift_id = ? AND s.status = 'completed'`
    )
    .all(shiftId) as unknown as SaleLineForProfitRow[]

  return rows.map((row) => ({
    productId: row.product_id,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    unitCost: row.unit_cost
  }))
}

interface DepartmentSalesRow {
  departmentId: number
  departmentName: string
  total: number
}

/**
 * "Ventas por departamento" (daily-report/spec.md "Departament Breakdown"):
 * usa el `department_id` SNAPSHOT de `sale_lines` (design.md Decision 7),
 * no el departamento actual del producto -- reasignar un producto despues
 * no debe cambiar el reporte de un turno ya cerrado. Departamentos sin
 * ventas ese turno se omiten (spec: "MAY omitirse").
 */
function getDepartmentSalesForShift(db: DatabaseSync, shiftId: number): DepartmentSalesLine[] {
  const rows = db
    .prepare(
      `SELECT sl.department_id as departmentId, d.name as departmentName, SUM(sl.line_total) as total
       FROM sale_lines sl
       JOIN sales s ON s.id = sl.sale_id
       JOIN departments d ON d.id = sl.department_id
       WHERE s.shift_id = ? AND s.status = 'completed'
       GROUP BY sl.department_id, d.name
       ORDER BY d.name`
    )
    .all(shiftId) as unknown as DepartmentSalesRow[]

  return rows.map((row) => ({
    departmentId: row.departmentId,
    departmentName: row.departmentName,
    total: roundToCents(row.total)
  }))
}

/**
 * `reports:dailyCut` (tasks.md 8.1): construye las 9 secciones EXACTAS de
 * daily-report/spec.md "Fixed Section Order", filtradas por `shift_id`
 * (spec: "Report Is Per Shift/Day") -- funciona igual para un turno abierto
 * (vista previa, tasks.md 8.7, `isPreview: true`) o cerrado.
 *
 * Formulas seccion por seccion (ver comentarios de cada helper para las
 * deviations documentadas vs. design.md):
 * 1. Entradas efectivo = inicio de caja + entradas de cambio
 * 2. Ventas de contado = efectivo + tarjeta (EXCLUYE credito)
 * 3. Salidas/Proveedores = cash_movements tipo 'salida'
 * 4. Dinero en caja = (1) + ventas efectivo - (3) [= computeExpectedCash]
 * 5. Dinero en bancos = ventas con tarjeta
 * 6. Ventas totales = (2) + Pagos de creditos (8)
 * 7. Ganancia del dia = ver computeProfit
 * 8. Pagos de creditos = credit_payments del turno
 * 9. Ventas por departamento = sale_lines agrupadas por departamento
 */
export function getDailyCutReport(db: DatabaseSync, shiftId: number): DailyCutReport {
  const shift = getShiftById(db, shiftId)
  if (!shift) {
    throw new Error(`Turno ${shiftId} no encontrado`)
  }

  const cashSummary = getShiftCashSummary(db, shiftId)
  const movements = listCashMovements(db, shiftId)
  const cashEntriesMovements = movements.filter((movement) => movement.type === 'entrada')
  const supplierPayments = movements.filter((movement) => movement.type === 'salida')

  const cashEntriesTotal = roundToCents(shift.openingCash + cashSummary.cashInTotal)
  const cashSalesTotal = sumSalePaymentsForShift(db, shiftId, ['efectivo', 'tarjeta'])
  const supplierPaymentsTotal = roundToCents(cashSummary.cashOutTotal)
  const cashOnHand = computeExpectedCash({
    openingCash: shift.openingCash,
    cashInTotal: cashSummary.cashInTotal,
    cashSalesTotal: cashSummary.cashSalesTotal,
    cashOutTotal: cashSummary.cashOutTotal
  })
  const bankTotal = sumSalePaymentsForShift(db, shiftId, ['tarjeta'])

  const { profit, uncostedProductCount } = computeProfit(getSaleLinesForShift(db, shiftId))

  const creditPayments = listCreditPaymentsForShift(db, shiftId)
  const creditPaymentsTotal = sumCreditPaymentsForShift(db, shiftId)

  const totalSales = computeTotalSales(cashSalesTotal, creditPaymentsTotal)

  return {
    shiftId,
    shiftStatus: shift.status,
    isPreview: shift.status === 'open',
    cashEntriesOpening: shift.openingCash,
    cashEntriesMovements,
    cashEntriesTotal,
    cashSalesTotal,
    supplierPayments,
    supplierPaymentsTotal,
    cashOnHand,
    bankTotal,
    totalSales,
    profit,
    uncostedProductCount,
    creditPayments,
    creditPaymentsTotal,
    departmentSales: getDepartmentSalesForShift(db, shiftId)
  }
}
