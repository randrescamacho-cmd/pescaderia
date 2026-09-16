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

/**
 * Tolerancia para comparar sumas de punto flotante contra un total en
 * centavos. El ruido REAL de punto flotante en estos calculos es del
 * orden de 1e-13 a 1e-15 (confirmado con el caso $11.11 x3 = $33.33:
 * diferencia real ~5e-15). Medio centavo (0.005) da un margen generoso
 * para ese ruido -- incluyendo el residual que puede quedar al sumar
 * varias `line_total` ya redondeadas a centavos -- sin llegar nunca a
 * absorber un faltante real de dinero: sales-transactions/spec.md
 * "Split Payment per Sale" exige rechazar el cierre si la suma no
 * coincide EXACTAMENTE con el total, y un faltante real siempre es
 * >= 1 centavo (0.01), muy por encima de este umbral.
 */
export const AMOUNT_EPSILON = 0.005

/** Redondea un monto a centavos (2 decimales), la unidad minima de moneda. */
function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100
}

/**
 * Redondea a centavos en el punto de calculo: productos vendidos por peso
 * (cantidad fraccionaria, ej. 0.733 kg) producen `quantity * unitPrice` con
 * mas de 2 decimales de precision real (ej. 62.6715), y ese valor se
 * persiste tal cual en `sale_lines.line_total` si no se normaliza aqui.
 */
export function computeLineTotal(line: SaleLineAmounts): number {
  return roundToCents(line.quantity * line.unitPrice)
}

/**
 * Suma lineas ya redondeadas a centavos (via `computeLineTotal`) y vuelve a
 * redondear el resultado: sumar varios floats de 2 decimales en JS puede
 * dejar un residual de punto flotante (mismo fenomeno que 0.1 + 0.2); ese
 * residual queda muy por debajo de AMOUNT_EPSILON, pero redondear aqui evita
 * que se acumule al comparar contra `paymentsMatchTotal` en ventas con
 * muchas lineas.
 */
export function computeSaleTotal(lines: SaleLineAmounts[]): number {
  return roundToCents(lines.reduce((sum, line) => sum + computeLineTotal(line), 0))
}

export function sumPaymentAmounts(payments: PaymentAmount[]): number {
  return payments.reduce((sum, payment) => sum + payment.amount, 0)
}

/**
 * sales-transactions/spec.md "Split Payment per Sale": la suma de las
 * porciones MUST ser igual al total. Usa AMOUNT_EPSILON para tolerar ruido
 * de punto flotante, no para permitir faltantes reales (cualquier faltante
 * de 1 centavo o mas se rechaza).
 */
export function paymentsMatchTotal(payments: PaymentAmount[], total: number): boolean {
  return Math.abs(sumPaymentAmounts(payments) - total) <= AMOUNT_EPSILON
}
