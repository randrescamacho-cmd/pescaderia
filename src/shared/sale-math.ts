// Matematica pura de ventas, compartida entre main (db/queries/sales.ts) y
// renderer (screens/Ventas.tsx, components/SplitPaymentModal.tsx). Vive en
// src/shared/ por el mismo motivo que ipc-types.ts (design.md Decision 2):
// evita duplicar la formula de total/validacion de pago dividido entre los
// dos lados del contextBridge -- sales-transactions/spec.md "Sale Total
// Calculation" y "Split Payment per Sale" son la fuente de estas reglas.

export interface SaleLineAmounts {
  quantity: number
  unitPrice: number
}

export interface PaymentAmount {
  amount: number
}

/** Tolerancia de un centavo para comparar sumas de punto flotante. */
export const AMOUNT_EPSILON = 0.01

export function computeLineTotal(line: SaleLineAmounts): number {
  return line.quantity * line.unitPrice
}

export function computeSaleTotal(lines: SaleLineAmounts[]): number {
  return lines.reduce((sum, line) => sum + computeLineTotal(line), 0)
}

export function sumPaymentAmounts(payments: PaymentAmount[]): number {
  return payments.reduce((sum, payment) => sum + payment.amount, 0)
}

/**
 * sales-transactions/spec.md "Split Payment per Sale": la suma de las
 * porciones MUST ser igual al total. Usa AMOUNT_EPSILON para tolerar ruido
 * de punto flotante, no para permitir faltantes reales (10 centavos o mas
 * siguen rechazandose).
 */
export function paymentsMatchTotal(payments: PaymentAmount[], total: number): boolean {
  return Math.abs(sumPaymentAmounts(payments) - total) <= AMOUNT_EPSILON
}
