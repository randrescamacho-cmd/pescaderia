import { useEffect, useState } from 'react'
import { api } from '../ipc-client'
import type { CashMovement, CloseShiftResult, Shift } from '../../shared/ipc-types'

/**
 * Pantalla de Caja (design.md "Estructura de Carpetas" solo lista una
 * pantalla `caja`, no tres separadas) -- cubre apertura de turno (6.6),
 * entradas/salidas (6.7) y cierre de turno (6.8) como secciones de un mismo
 * componente, igual criterio que `Productos.tsx` maneja crear+editar en un
 * solo archivo.
 */
function Caja(): React.JSX.Element {
  const [shift, setShift] = useState<Shift | null>(null)
  const [movements, setMovements] = useState<CashMovement[]>([])
  const [openingCash, setOpeningCash] = useState('')
  const [inAmount, setInAmount] = useState('')
  const [inConcept, setInConcept] = useState('')
  const [outAmount, setOutAmount] = useState('')
  const [outConcept, setOutConcept] = useState('')
  const [outProvider, setOutProvider] = useState('')
  const [countedCash, setCountedCash] = useState('')
  const [closeResult, setCloseResult] = useState<CloseShiftResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function reload(): Promise<void> {
    const current = await api.cash.getOpenShift()
    setShift(current)
    setMovements(current ? await api.cash.listMovements(current.id) : [])
  }

  useEffect(() => {
    reload()
  }, [])

  async function handleOpenShift(): Promise<void> {
    setError(null)
    try {
      await api.cash.openShift(Number(openingCash))
      setOpeningCash('')
      setCloseResult(null)
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  async function handleCashIn(): Promise<void> {
    if (!shift) return
    setError(null)
    try {
      await api.cash.cashIn(shift.id, Number(inAmount), inConcept)
      setInAmount('')
      setInConcept('')
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  async function handleCashOut(): Promise<void> {
    if (!shift) return
    setError(null)
    try {
      await api.cash.cashOut(shift.id, Number(outAmount), outConcept, outProvider)
      setOutAmount('')
      setOutConcept('')
      setOutProvider('')
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  async function handleCloseShift(): Promise<void> {
    if (!shift) return
    setError(null)
    try {
      const result = await api.cash.closeShift(shift.id, Number(countedCash))
      setCloseResult(result)
      setCountedCash('')
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  if (!shift) {
    return (
      <section>
        <h2>Caja</h2>
        {error && <p role="alert">{error}</p>}
        {closeResult && (
          <p>
            Turno cerrado. Esperado: ${closeResult.expectedCash.toFixed(2)}, contado: $
            {closeResult.countedCash.toFixed(2)}, diferencia: ${closeResult.difference.toFixed(2)}
          </p>
        )}
        <h3>Apertura de turno</h3>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            handleOpenShift()
          }}
        >
          <input
            value={openingCash}
            onChange={(event) => setOpeningCash(event.target.value)}
            placeholder="Monto inicial"
            type="number"
          />
          <button type="submit">Abrir turno</button>
        </form>
      </section>
    )
  }

  return (
    <section>
      <h2>Caja</h2>
      {error && <p role="alert">{error}</p>}
      <p>
        Turno abierto desde {shift.openedAt} - inicio de caja: ${shift.openingCash.toFixed(2)}
      </p>

      <h3>Entradas y salidas</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          handleCashIn()
        }}
      >
        <input
          value={inAmount}
          onChange={(event) => setInAmount(event.target.value)}
          placeholder="Monto de entrada"
          type="number"
        />
        <input
          value={inConcept}
          onChange={(event) => setInConcept(event.target.value)}
          placeholder="Motivo"
        />
        <button type="submit">Registrar entrada</button>
      </form>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          handleCashOut()
        }}
      >
        <input
          value={outAmount}
          onChange={(event) => setOutAmount(event.target.value)}
          placeholder="Monto de salida"
          type="number"
        />
        <input
          value={outConcept}
          onChange={(event) => setOutConcept(event.target.value)}
          placeholder="Motivo"
        />
        <input
          value={outProvider}
          onChange={(event) => setOutProvider(event.target.value)}
          placeholder="Proveedor"
        />
        <button type="submit">Registrar salida</button>
      </form>

      <ul>
        {movements.map((movement) => (
          <li key={movement.id}>
            {movement.type === 'entrada' ? 'Entrada' : 'Salida'} - ${movement.amount.toFixed(2)} -{' '}
            {movement.concept}
            {movement.provider ? ` (${movement.provider})` : ''}
          </li>
        ))}
      </ul>

      <h3>Cierre de turno</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          handleCloseShift()
        }}
      >
        <input
          value={countedCash}
          onChange={(event) => setCountedCash(event.target.value)}
          placeholder="Dinero contado"
          type="number"
        />
        <button type="submit">Cerrar turno</button>
      </form>
    </section>
  )
}

export default Caja
