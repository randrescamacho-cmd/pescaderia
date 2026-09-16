import { useState } from 'react'
import { paymentsMatchTotal, sumPaymentAmounts } from '../../shared/sale-math'
import type { Customer, PaymentMethod, SalePaymentInput } from '../../shared/ipc-types'

interface PaymentRowState {
  method: PaymentMethod
  amount: string
  customerId: string
}

interface SplitPaymentModalProps {
  total: number
  customers: Customer[]
  onConfirm: (payments: SalePaymentInput[]) => void
  onCancel: () => void
}

function emptyRow(amount: number): PaymentRowState {
  return { method: 'efectivo', amount: amount ? String(amount) : '', customerId: '' }
}

function toPaymentInput(row: PaymentRowState): SalePaymentInput {
  return {
    method: row.method,
    amount: Number(row.amount) || 0,
    customerId: row.method === 'credito' && row.customerId ? Number(row.customerId) : null
  }
}

/**
 * Modal de pago dividido (tasks.md 5.9, sales-transactions/spec.md "Split
 * Payment per Sale"). Empieza con una sola porcion `efectivo` precargada
 * con el total completo (caso mas comun: venta de contado) -- el cajero
 * puede editar el metodo/monto o agregar mas porciones para dividir el
 * pago. El boton de confirmar se deshabilita mientras la suma no sea igual
 * al total (paymentsMatchTotal, mismo criterio que usara la validacion real
 * del lado del main process en `db/queries/sales.ts`) o mientras alguna
 * porcion `credito` no tenga cliente -- pero el error definitivo lo decide
 * siempre el backend (`sales:create`), esto es solo para UX inmediata.
 */
function SplitPaymentModal({
  total,
  customers,
  onConfirm,
  onCancel
}: SplitPaymentModalProps): React.JSX.Element {
  const [rows, setRows] = useState<PaymentRowState[]>([emptyRow(total)])

  const payments = rows.map(toPaymentInput)
  const sum = sumPaymentAmounts(payments)
  const sumMatches = paymentsMatchTotal(payments, total)
  const missingCreditCustomer = rows.some((row) => row.method === 'credito' && !row.customerId)
  const canConfirm = sumMatches && !missingCreditCustomer && rows.length > 0

  function updateRow(index: number, patch: Partial<PaymentRowState>): void {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addRow(): void {
    setRows((current) => [...current, emptyRow(0)])
  }

  function removeRow(index: number): void {
    setRows((current) => current.filter((_, i) => i !== index))
  }

  return (
    <div role="dialog" aria-label="Pago dividido">
      <h3>Registrar pago (total: ${total.toFixed(2)})</h3>
      {rows.map((row, index) => (
        <div key={index}>
          <select
            value={row.method}
            onChange={(event) =>
              updateRow(index, { method: event.target.value as PaymentMethod, customerId: '' })
            }
          >
            <option value="efectivo">Efectivo</option>
            <option value="tarjeta">Tarjeta</option>
            <option value="credito">Credito</option>
          </select>
          <input
            value={row.amount}
            onChange={(event) => updateRow(index, { amount: event.target.value })}
            placeholder="Monto"
            type="number"
          />
          {row.method === 'credito' && (
            <select
              value={row.customerId}
              onChange={(event) => updateRow(index, { customerId: event.target.value })}
            >
              <option value="">Selecciona un cliente</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          )}
          {rows.length > 1 && (
            <button type="button" onClick={() => removeRow(index)}>
              Quitar porcion
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={addRow}>
        Agregar otra porcion
      </button>

      <p>
        Suma de porciones: ${sum.toFixed(2)} / Total: ${total.toFixed(2)}
        {!sumMatches && ' - la suma debe ser igual al total'}
      </p>
      {missingCreditCustomer && (
        <p role="alert">Selecciona un cliente para la porcion a credito.</p>
      )}
      {customers.length === 0 && rows.some((row) => row.method === 'credito') && (
        <p role="alert">
          No hay clientes registrados todavia. La gestion completa de clientes/creditos llega en el
          siguiente PR; por ahora solo se puede vender a credito a un cliente ya capturado.
        </p>
      )}

      <button type="button" disabled={!canConfirm} onClick={() => onConfirm(payments)}>
        Confirmar venta
      </button>
      <button type="button" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  )
}

export default SplitPaymentModal
