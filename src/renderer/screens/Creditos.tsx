import { useEffect, useState } from 'react'
import { api } from '../ipc-client'
import type { CustomerBalance, Shift } from '../../shared/ipc-types'

/**
 * Pantalla de Creditos (tasks.md 7.7): lista de clientes con su saldo actual
 * y formulario para registrar un pago que abone al saldo. Requiere un turno
 * abierto (igual que Ventas/Caja) porque `credit:pay` (customer-credit/
 * spec.md "Credit Payments Reflected in Daily Report") necesita un
 * `shift_id` para que el pago aparezca en el Corte del Dia correcto.
 */
function Creditos(): React.JSX.Element {
  const [shift, setShift] = useState<Shift | null>(null)
  const [balances, setBalances] = useState<CustomerBalance[]>([])
  const [selectedCustomerId, setSelectedCustomerId] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function reload(): Promise<void> {
    setShift(await api.cash.getOpenShift())
    setBalances(await api.credit.listBalances())
  }

  useEffect(() => {
    reload()
  }, [])

  async function handlePay(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!shift || !selectedCustomerId) return
    setError(null)
    setNotice(null)
    try {
      const result = await api.credit.pay({
        customerId: Number(selectedCustomerId),
        shiftId: shift.id,
        amount: Number(amount)
      })
      setNotice(`Pago registrado. Saldo restante: $${result.balance.toFixed(2)}`)
      setAmount('')
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  const selectedBalance = balances.find((b) => String(b.id) === selectedCustomerId)?.balance ?? null

  return (
    <section>
      <h2>Creditos de clientes</h2>
      {error && <p role="alert">{error}</p>}
      {notice && <p>{notice}</p>}
      {!shift && (
        <p role="alert">
          No hay un turno de caja abierto. Puedes ver los saldos, pero abre un turno en la pantalla de
          Caja antes de registrar un pago.
        </p>
      )}

      <h3>Saldos</h3>
      <ul>
        {balances.map((balance) => (
          <li key={balance.id}>
            {balance.name}: ${balance.balance.toFixed(2)}
          </li>
        ))}
        {balances.length === 0 && <li>No hay clientes registrados todavia.</li>}
      </ul>

      <h3>Registrar pago</h3>
      <form onSubmit={handlePay}>
        <select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)}>
          <option value="">Selecciona un cliente</option>
          {balances.map((balance) => (
            <option key={balance.id} value={balance.id}>
              {balance.name} (saldo: ${balance.balance.toFixed(2)})
            </option>
          ))}
        </select>
        <input
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          placeholder="Monto del pago"
          type="number"
        />
        {selectedBalance !== null && (
          <p>
            Saldo pendiente: ${selectedBalance.toFixed(2)}
            {Number(amount) > selectedBalance && ' - el pago no puede exceder el saldo pendiente'}
          </p>
        )}
        <button type="submit" disabled={!shift || !selectedCustomerId || !amount}>
          Registrar pago
        </button>
      </form>
    </section>
  )
}

export default Creditos
