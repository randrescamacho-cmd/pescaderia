import { useState } from 'react'
import { paymentsMatchTotal, sumPaymentAmounts } from '../../shared/sale-math'
import type { Customer, PaymentMethod } from '../../shared/ipc-types'

/**
 * Borrador de porcion de pago del modal (Fase 7/PR4, tasks.md 7.6): distinto
 * de `SalePaymentInput` porque una porcion `credito` puede referirse a un
 * cliente TODAVIA NO CREADO (`customerName`, sin id real aun) -- resolver
 * ese nombre a un `customerId` real (via `customers:create`) es
 * responsabilidad de quien llama a `onConfirm` (`Ventas.tsx`), ANTES de
 * invocar `sales:create`, porque `sale_payments.customer_id` es una FK real
 * que exige que el cliente ya exista.
 */
export interface PaymentDraft {
  method: PaymentMethod
  amount: number
  customerId: number | null
  customerName: string | null
}

const NEW_CUSTOMER_OPTION = '__new__'

interface PaymentRowState {
  method: PaymentMethod
  amount: string
  customerMode: 'existing' | 'new'
  customerId: string
  customerName: string
}

interface SplitPaymentModalProps {
  total: number
  customers: Customer[]
  onConfirm: (payments: PaymentDraft[]) => void
  onCancel: () => void
}

function emptyRow(amount: number): PaymentRowState {
  return {
    method: 'efectivo',
    amount: amount ? String(amount) : '',
    customerMode: 'existing',
    customerId: '',
    customerName: ''
  }
}

function toDraft(row: PaymentRowState): PaymentDraft {
  const isCredito = row.method === 'credito'
  return {
    method: row.method,
    amount: Number(row.amount) || 0,
    customerId: isCredito && row.customerMode === 'existing' && row.customerId ? Number(row.customerId) : null,
    customerName: isCredito && row.customerMode === 'new' && row.customerName.trim() ? row.customerName.trim() : null
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

  const drafts = rows.map(toDraft)
  const sum = sumPaymentAmounts(drafts)
  const sumMatches = paymentsMatchTotal(drafts, total)
  const missingCreditCustomer = rows.some(
    (row) =>
      row.method === 'credito' &&
      ((row.customerMode === 'existing' && !row.customerId) ||
        (row.customerMode === 'new' && !row.customerName.trim()))
  )
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
              updateRow(index, {
                method: event.target.value as PaymentMethod,
                customerId: '',
                customerName: '',
                customerMode: 'existing'
              })
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
            <>
              <select
                value={row.customerMode === 'new' ? NEW_CUSTOMER_OPTION : row.customerId}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === NEW_CUSTOMER_OPTION) {
                    updateRow(index, { customerMode: 'new', customerId: '' })
                  } else {
                    updateRow(index, { customerMode: 'existing', customerId: value, customerName: '' })
                  }
                }}
              >
                <option value="">Selecciona un cliente</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}
                  </option>
                ))}
                <option value={NEW_CUSTOMER_OPTION}>+ Nuevo cliente</option>
              </select>
              {row.customerMode === 'new' && (
                <input
                  value={row.customerName}
                  onChange={(event) => updateRow(index, { customerName: event.target.value })}
                  placeholder="Nombre del cliente nuevo"
                />
              )}
            </>
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
        <p role="alert">
          Selecciona un cliente para la porcion a credito, o elige "+ Nuevo cliente" y captura su nombre.
        </p>
      )}

      <button type="button" disabled={!canConfirm} onClick={() => onConfirm(drafts)}>
        Confirmar venta
      </button>
      <button type="button" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  )
}

export default SplitPaymentModal
