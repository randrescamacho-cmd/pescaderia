import { useEffect, useState } from 'react'
import { api } from '../ipc-client'
import type { DailyCutReport, Shift } from '../../shared/ipc-types'

/**
 * Pantalla de Corte del Dia (tasks.md 8.6/8.7): las 9 secciones EXACTAS en
 * el orden fijo de daily-report/spec.md "Fixed Section Order". Si hay un
 * turno abierto, lo carga automaticamente como vista previa (spec: "Generar
 * corte antes de cerrar turno" SHOULD permitirse, no bloqueante) -- el
 * banner de "vista previa" deja claro que el turno sigue abierto. Tambien
 * permite consultar el corte de OTRO turno por id (util para un turno ya
 * cerrado, dado que esta app todavia no tiene una pantalla de historial de
 * turnos -- ver apply-progress.md "Pendiente para PR5" si aplica).
 */
function CorteDelDia(): React.JSX.Element {
  const [openShift, setOpenShift] = useState<Shift | null>(null)
  const [shiftIdInput, setShiftIdInput] = useState('')
  const [report, setReport] = useState<DailyCutReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [printNotice, setPrintNotice] = useState<string | null>(null)

  async function loadReport(shiftId: number): Promise<void> {
    setError(null)
    try {
      setReport(await api.reports.dailyCut(shiftId))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  useEffect(() => {
    async function init(): Promise<void> {
      const current = await api.cash.getOpenShift()
      setOpenShift(current)
      if (current) {
        await loadReport(current.id)
      }
    }
    init()
  }, [])

  async function handleLoadOther(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!shiftIdInput) return
    await loadReport(Number(shiftIdInput))
  }

  async function handlePrint(): Promise<void> {
    if (!report) return
    setPrintNotice(null)
    setError(null)
    try {
      const result = await api.print.dailyCut(report.shiftId)
      setPrintNotice(result.printed ? 'Ticket enviado a impresion.' : 'Impresion cancelada por el usuario.')
    } catch (caught) {
      setError(
        `No se pudo imprimir (revisa que la impresora este conectada): ${
          caught instanceof Error ? caught.message : String(caught)
        }`
      )
    }
  }

  return (
    <section>
      <h2>Corte del Dia</h2>
      {error && <p role="alert">{error}</p>}
      {printNotice && <p>{printNotice}</p>}

      <form onSubmit={handleLoadOther}>
        <input
          value={shiftIdInput}
          onChange={(event) => setShiftIdInput(event.target.value)}
          placeholder="Ver corte de otro turno (id)"
          type="number"
        />
        <button type="submit">Consultar</button>
      </form>

      {!report && !openShift && (
        <p>No hay un turno abierto. Consulta un turno cerrado por id arriba.</p>
      )}

      {report && (
        <>
          {report.isPreview && (
            <p role="alert">
              Vista previa: el turno #{report.shiftId} todavia esta abierto. Estos numeros cambiaran hasta
              que se cierre.
            </p>
          )}

          <h3>1. Entradas efectivo</h3>
          <p>Inicio de caja: ${report.cashEntriesOpening.toFixed(2)}</p>
          <ul>
            {report.cashEntriesMovements.map((m) => (
              <li key={m.id}>
                {m.concept}: ${m.amount.toFixed(2)}
              </li>
            ))}
          </ul>
          <p>
            <strong>Total: ${report.cashEntriesTotal.toFixed(2)}</strong>
          </p>

          <h3>2. Ventas de contado</h3>
          <p>
            <strong>Total (efectivo + tarjeta): ${report.cashSalesTotal.toFixed(2)}</strong>
          </p>

          <h3>3. Salidas / Proveedores</h3>
          <ul>
            {report.supplierPayments.map((m) => (
              <li key={m.id}>
                {m.concept} ({m.provider}): ${m.amount.toFixed(2)}
              </li>
            ))}
          </ul>
          <p>
            <strong>Total: ${report.supplierPaymentsTotal.toFixed(2)}</strong>
          </p>

          <h3>4. Dinero en caja</h3>
          <p>
            <strong>${report.cashOnHand.toFixed(2)}</strong>
          </p>

          <h3>5. Dinero en bancos</h3>
          <p>
            <strong>${report.bankTotal.toFixed(2)}</strong>
          </p>

          <h3>6. Ventas totales</h3>
          <p>
            <strong>${report.totalSales.toFixed(2)}</strong>
          </p>

          <h3>7. Ganancia del dia</h3>
          <p>
            <strong>${report.profit.toFixed(2)}</strong>
          </p>
          {report.uncostedProductCount > 0 && (
            <p role="alert">
              Advertencia: {report.uncostedProductCount} producto(s) vendido(s) sin costo capturado --
              se usaron como costo $0 en este calculo.
            </p>
          )}

          <h3>8. Pagos de creditos</h3>
          {report.creditPayments.length === 0 ? (
            <p>NO HUBO PAGOS</p>
          ) : (
            <>
              <ul>
                {report.creditPayments.map((p) => (
                  <li key={p.id}>
                    {p.customerName}: ${p.amount.toFixed(2)}
                  </li>
                ))}
              </ul>
              <p>
                <strong>Total: ${report.creditPaymentsTotal.toFixed(2)}</strong>
              </p>
            </>
          )}

          <h3>9. Ventas por departamento</h3>
          <ul>
            {report.departmentSales.map((d) => (
              <li key={d.departmentId}>
                {d.departmentName}: ${d.total.toFixed(2)}
              </li>
            ))}
            {report.departmentSales.length === 0 && <li>Sin ventas registradas este turno.</li>}
          </ul>

          <button type="button" onClick={handlePrint}>
            Imprimir Corte del Dia
          </button>
        </>
      )}
    </section>
  )
}

export default CorteDelDia
