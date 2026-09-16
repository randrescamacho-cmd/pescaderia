import type { DatabaseSync } from 'node:sqlite'
import type { Sale, SaleInput, SaleLineInput, SalePaymentInput } from '../../../shared/ipc-types'
import { computeLineTotal, computeSaleTotal, paymentsMatchTotal } from '../../../shared/sale-math'
import { getProductById } from './products'

interface SaleRow {
  id: number
  shift_id: number
  status: 'completed' | 'voided'
  subtotal: number
  total: number
  created_at: string
}

interface SaleLineRow {
  id: number
  sale_id: number
  product_id: number
  department_id: number
  quantity: number
  unit_price: number
  unit_cost: number | null
  line_total: number
}

interface SalePaymentRow {
  id: number
  sale_id: number
  method: 'efectivo' | 'tarjeta' | 'credito'
  amount: number
  customer_id: number | null
}

/**
 * Validacion pura (sales-transactions/spec.md "Sale Composed of Line Items"
 * > "Cantidad invalida" y "Sale Total Calculation" > "Cerrar venta vacia").
 * No requiere SQLite -- solo mira la forma del input, no si los productos
 * existen (eso lo valida `createSale` al resolverlos).
 */
export function validateSaleLines(lines: SaleLineInput[]): string[] {
  const errors: string[] = []

  if (lines.length === 0) {
    errors.push('la venta debe tener al menos una linea')
  }

  for (const line of lines) {
    if (!(line.quantity > 0)) {
      errors.push(`la cantidad de la linea del producto ${line.productId} debe ser mayor a cero`)
    }
  }

  return errors
}

/**
 * Validacion pura (sales-transactions/spec.md "Split Payment per Sale"):
 * la suma de las porciones MUST ser igual al total, y una porcion `credito`
 * MUST tener un cliente asociado. Reusa `paymentsMatchTotal` de
 * `shared/sale-math.ts` (mismo criterio de tolerancia de punto flotante que
 * usara el renderer para pre-validar antes de invocar `sales:create`).
 */
export function validateSalePayments(payments: SalePaymentInput[], total: number): string[] {
  const errors: string[] = []

  if (!paymentsMatchTotal(payments, total)) {
    errors.push('la suma de las porciones de pago debe ser igual al total de la venta')
  }

  for (const payment of payments) {
    if (payment.method === 'credito' && !payment.customerId) {
      errors.push('una porcion de pago a credito requiere un cliente asociado')
    }
  }

  return errors
}

function mapSaleRow(row: SaleRow): Omit<Sale, 'lines' | 'payments'> {
  return {
    id: row.id,
    shiftId: row.shift_id,
    subtotal: row.subtotal,
    total: row.total,
    createdAt: row.created_at
  }
}

function mapLineRow(row: SaleLineRow): Sale['lines'][number] {
  return {
    id: row.id,
    productId: row.product_id,
    departmentId: row.department_id,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    unitCost: row.unit_cost,
    lineTotal: row.line_total
  }
}

function mapPaymentRow(row: SalePaymentRow): Sale['payments'][number] {
  return {
    id: row.id,
    method: row.method,
    amount: row.amount,
    customerId: row.customer_id
  }
}

/**
 * Reconstruye una venta completa (encabezado + lineas + pagos). Usada tanto
 * como valor de retorno de `createSale` como para consultas futuras
 * (impresion de ticket, Fase 9).
 */
export function getSaleById(db: DatabaseSync, saleId: number): Sale {
  const saleRow = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId) as unknown as
    | SaleRow
    | undefined

  if (!saleRow) {
    throw new Error(`Venta ${saleId} no encontrada`)
  }

  const lineRows = db
    .prepare('SELECT * FROM sale_lines WHERE sale_id = ? ORDER BY id')
    .all(saleId) as unknown as SaleLineRow[]

  const paymentRows = db
    .prepare('SELECT * FROM sale_payments WHERE sale_id = ? ORDER BY id')
    .all(saleId) as unknown as SalePaymentRow[]

  return {
    ...mapSaleRow(saleRow),
    lines: lineRows.map(mapLineRow),
    payments: paymentRows.map(mapPaymentRow)
  }
}

/**
 * `sales:create` (tasks.md 5.1-5.3): registra una venta transaccional con
 * snapshot de departamento/costo/precio (design.md Decision 7). Rechaza:
 * venta sin turno abierto (cash-register/spec.md "Intentar vender sin turno
 * abierto"), venta vacia o con cantidad invalida, pagos que no suman el
 * total, y porcion `credito` sin cliente. Todo dentro de una transaccion:
 * si algo falla (incluido un `productId` inexistente), se hace ROLLBACK y
 * nada queda escrito.
 */
export function createSale(db: DatabaseSync, input: SaleInput): Sale {
  const lineErrors = validateSaleLines(input.lines)
  if (lineErrors.length > 0) {
    throw new Error(`Venta invalida: ${lineErrors.join(', ')}`)
  }

  const shiftRow = db.prepare('SELECT status FROM shifts WHERE id = ?').get(input.shiftId) as
    | { status: string }
    | undefined

  if (!shiftRow || shiftRow.status !== 'open') {
    throw new Error('No hay un turno de caja abierto; abre un turno antes de vender')
  }

  db.exec('BEGIN')
  try {
    const resolvedLines = input.lines.map((line) => {
      const product = getProductById(db, line.productId)
      if (!product) {
        throw new Error(`Producto ${line.productId} no encontrado o inactivo`)
      }
      return { line, product }
    })

    const total = computeSaleTotal(
      resolvedLines.map(({ line, product }) => ({ quantity: line.quantity, unitPrice: product.price }))
    )

    const paymentErrors = validateSalePayments(input.payments, total)
    if (paymentErrors.length > 0) {
      throw new Error(`Venta invalida: ${paymentErrors.join(', ')}`)
    }

    const saleResult = db
      .prepare('INSERT INTO sales (shift_id, subtotal, total) VALUES (?, ?, ?)')
      .run(input.shiftId, total, total)
    const saleId = Number(saleResult.lastInsertRowid)

    for (const { line, product } of resolvedLines) {
      const lineTotal = computeLineTotal({ quantity: line.quantity, unitPrice: product.price })
      db.prepare(
        `INSERT INTO sale_lines (sale_id, product_id, department_id, quantity, unit_price, unit_cost, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(saleId, product.id, product.departmentId, line.quantity, product.price, product.cost, lineTotal)
    }

    for (const payment of input.payments) {
      db.prepare(
        'INSERT INTO sale_payments (sale_id, method, amount, customer_id) VALUES (?, ?, ?, ?)'
      ).run(saleId, payment.method, payment.amount, payment.customerId ?? null)
    }

    db.exec('COMMIT')
    return getSaleById(db, saleId)
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
