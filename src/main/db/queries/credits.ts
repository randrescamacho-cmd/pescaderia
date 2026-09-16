import type { DatabaseSync } from 'node:sqlite'
import type {
  Customer,
  CustomerBalance,
  CreditPaymentRecord,
  GrantCreditInput,
  GrantCreditResult,
  PayCreditInput,
  PayCreditResult
} from '../../../shared/ipc-types'
import { roundToCents } from '../../../shared/sale-math'
import { createCustomer, findCustomerByName, getCustomerById } from './customers'

/**
 * `customer-credit/spec.md` "Register Credit Payments" / design.md:
 * saldo = SUM(customer_credits.amount) - SUM(credit_payments.amount), sin
 * filtrar por turno (el saldo de un cliente es acumulado entre turnos/dias,
 * a diferencia del Corte del Dia que SI filtra por shift_id -- ver
 * `daily-report/spec.md` "Report Is Per Shift/Day", que aplica al REPORTE,
 * no al saldo de credito del cliente).
 */
export function getCustomerBalance(db: DatabaseSync, customerId: number): number {
  const granted = (
    db
      .prepare('SELECT COALESCE(SUM(amount), 0) as total FROM customer_credits WHERE customer_id = ?')
      .get(customerId) as { total: number }
  ).total

  const paid = (
    db
      .prepare('SELECT COALESCE(SUM(amount), 0) as total FROM credit_payments WHERE customer_id = ?')
      .get(customerId) as { total: number }
  ).total

  return roundToCents(granted - paid)
}

/**
 * Resuelve el cliente objetivo de un `grantCredit`: por id (debe existir y
 * estar activo) o por nombre (reusa uno existente con nombre EXACTO igual,
 * o lo crea si es nuevo -- customer-credit/spec.md "Registrar cliente nuevo
 * al otorgar credito").
 */
function resolveGrantCustomer(db: DatabaseSync, input: GrantCreditInput): Customer {
  if (input.customerId) {
    const customer = getCustomerById(db, input.customerId)
    if (!customer) {
      throw new Error(`Cliente ${input.customerId} no encontrado o inactivo`)
    }
    return customer
  }

  if (input.customerName && input.customerName.trim()) {
    const trimmed = input.customerName.trim()
    return findCustomerByName(db, trimmed) ?? createCustomer(db, trimmed)
  }

  throw new Error('Se requiere un cliente existente (customerId) o el nombre de un cliente nuevo (customerName)')
}

/**
 * `credit:grant` (tasks.md 7.1): conecta una porcion de pago `credito` de
 * una venta (ya escrita en `sale_payments` desde PR3 -- ver
 * apply-progress.md "PR3 -> Pendiente para PR4") al saldo de credito real
 * del cliente en `customer_credits`. `saleId` es nullable porque tambien se
 * puede otorgar credito sin una venta asociada (ninguna spec lo prohibe;
 * `customer_credits.sale_id` ya era nullable desde el esquema de PR1).
 */
export function grantCredit(db: DatabaseSync, input: GrantCreditInput): GrantCreditResult {
  if (!(input.amount > 0)) {
    throw new Error('El monto del credito otorgado debe ser mayor a cero')
  }

  const customer = resolveGrantCustomer(db, input)
  const amount = roundToCents(input.amount)

  const result = db
    .prepare(
      'INSERT INTO customer_credits (customer_id, sale_id, shift_id, amount, note) VALUES (?, ?, ?, ?, ?)'
    )
    .run(customer.id, input.saleId ?? null, input.shiftId, amount, input.note ?? null)

  return {
    customer,
    creditId: Number(result.lastInsertRowid),
    balance: getCustomerBalance(db, customer.id)
  }
}

/**
 * `credit:pay` (tasks.md 7.2): registra un pago que abona al saldo.
 * Decision (customer-credit/spec.md "Pago mayor al saldo pendiente" permite
 * RECHAZAR o LIMITAR): este PR RECHAZA (lanza) en vez de limitar/clamp --
 * silenciosamente reducir el monto que el cajero tecleo podria registrar un
 * pago distinto al que el cliente entrego en efectivo sin que nadie lo note
 * (dinero real de por medio); rechazar obliga a confirmar el monto correcto
 * o corregirlo a mano, mismo criterio de "no silenciar montos" que
 * `paymentsMatchTotal`/AMOUNT_EPSILON en sale-math.ts.
 */
export function payCredit(db: DatabaseSync, input: PayCreditInput): PayCreditResult {
  if (!(input.amount > 0)) {
    throw new Error('El monto del pago debe ser mayor a cero')
  }

  const balance = getCustomerBalance(db, input.customerId)
  const amount = roundToCents(input.amount)

  if (amount > balance + 0.005) {
    throw new Error(
      `El pago ($${amount.toFixed(2)}) excede el saldo pendiente del cliente ($${balance.toFixed(2)})`
    )
  }

  const result = db
    .prepare(
      "INSERT INTO credit_payments (customer_id, shift_id, method, amount) VALUES (?, ?, ?, ?)"
    )
    .run(input.customerId, input.shiftId, input.method ?? 'efectivo', amount)

  return {
    paymentId: Number(result.lastInsertRowid),
    amount,
    balance: getCustomerBalance(db, input.customerId)
  }
}

/** `Creditos.tsx` (tasks.md 7.7): lista de clientes activos con su saldo actual. */
export function listCustomerBalances(db: DatabaseSync): CustomerBalance[] {
  const rows = db
    .prepare('SELECT id, name, active FROM customers WHERE active = 1 ORDER BY name')
    .all() as unknown as { id: number; name: string; active: number }[]

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    active: row.active === 1,
    balance: getCustomerBalance(db, row.id)
  }))
}

interface CreditPaymentRow {
  id: number
  customer_id: number
  customer_name: string
  amount: number
  created_at: string
}

/**
 * `daily-report/spec.md` "Credit Payments Reflected in Daily Report":
 * listado individual con cliente y monto, filtrado por turno (Report Is Per
 * Shift/Day). Usada por `db/queries/reports.ts` (Fase 8).
 */
export function listCreditPaymentsForShift(db: DatabaseSync, shiftId: number): CreditPaymentRecord[] {
  const rows = db
    .prepare(
      `SELECT cp.id, cp.customer_id, c.name as customer_name, cp.amount, cp.created_at
       FROM credit_payments cp
       JOIN customers c ON c.id = cp.customer_id
       WHERE cp.shift_id = ?
       ORDER BY cp.id`
    )
    .all(shiftId) as unknown as CreditPaymentRow[]

  return rows.map((row) => ({
    id: row.id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    amount: row.amount,
    createdAt: row.created_at
  }))
}

/** Total de la seccion "Pagos de creditos" del Corte del Dia (tasks.md 8.1/8.3). */
export function sumCreditPaymentsForShift(db: DatabaseSync, shiftId: number): number {
  const row = db
    .prepare('SELECT COALESCE(SUM(amount), 0) as total FROM credit_payments WHERE shift_id = ?')
    .get(shiftId) as { total: number }

  return roundToCents(row.total)
}
