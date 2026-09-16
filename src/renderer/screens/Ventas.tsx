import { useEffect, useRef, useState } from 'react'
import SplitPaymentModal, { type PaymentDraft } from '../components/SplitPaymentModal'
import { api } from '../ipc-client'
import { bufferToBarcode, isBarcodeScan, type BufferedKey } from './barcode-scanner'
import { computeSaleTotal } from '../../shared/sale-math'
import type { Customer, Product, Sale, SaleLineInput, SalePaymentInput, Shift } from '../../shared/ipc-types'

interface SaleLineState {
  productId: number
  name: string
  quantity: number
  unitPrice: number
}

/** Sin escaner/tecleo activo por > este tiempo, se descarta el buffer acumulado. */
const SCAN_IDLE_RESET_MS = 500

/**
 * Pantalla de Ventas (tasks.md 5.6-5.9). Requiere un turno de caja abierto
 * (cash-register/spec.md "Intentar vender sin turno abierto") -- si no hay
 * uno, muestra un aviso y bloquea la captura de lineas en vez de duplicar la
 * pantalla de apertura de `Caja.tsx`.
 *
 * Escaner USB-HID (tasks.md 5.7, design.md "Escaner USB-HID"): un listener
 * `keydown` a nivel de documento acumula teclas con su timestamp. Se ignoran
 * los eventos cuando el foco esta en un `input`/`textarea`/`select` (p.ej. el
 * buscador por nombre o el modal de pago) para no interferir con tecleo
 * normal de formularios -- el escaner se usa cuando NINGUN campo tiene foco,
 * que es el uso real esperado (el cajero dispara el escaneo, no escribe a la
 * vez). Al recibir Enter, `isBarcodeScan` decide si el buffer acumulado
 * corresponde a un escaneo (gaps < 50ms) o se descarta.
 */
function Ventas(): React.JSX.Element {
  const [shift, setShift] = useState<Shift | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [lines, setLines] = useState<SaleLineState[]>([])
  const [notFoundNotice, setNotFoundNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [lastSale, setLastSale] = useState<Sale | null>(null)
  const [printError, setPrintError] = useState<string | null>(null)

  const bufferRef = useRef<BufferedKey[]>([])
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    async function load(): Promise<void> {
      setShift(await api.cash.getOpenShift())
      setProducts(await api.catalog.listProducts())
      setCustomers(await api.customers.list())
    }
    load()
  }, [])

  function resetBuffer(): void {
    bufferRef.current = []
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
  }

  async function handleFoundBarcode(barcode: string): Promise<void> {
    const product = await api.catalog.findByBarcode(barcode)
    if (!product) {
      setNotFoundNotice(`Producto no encontrado para el codigo "${barcode}"`)
      return
    }
    setNotFoundNotice(null)
    addLine(product, 1)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return
      }

      if (event.key === 'Enter') {
        const buffer = bufferRef.current
        resetBuffer()
        if (isBarcodeScan(buffer)) {
          handleFoundBarcode(bufferToBarcode(buffer))
        }
        return
      }

      if (event.key.length !== 1) return

      bufferRef.current = [...bufferRef.current, { key: event.key, timestamp: Date.now() }]
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current)
      idleTimerRef.current = setTimeout(resetBuffer, SCAN_IDLE_RESET_MS)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  function addLine(product: Product, quantity: number): void {
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id)
      if (existing) {
        return current.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + quantity } : line
        )
      }
      return [...current, { productId: product.id, name: product.name, quantity, unitPrice: product.price }]
    })
  }

  function removeLine(productId: number): void {
    setLines((current) => current.filter((line) => line.productId !== productId))
  }

  const total = computeSaleTotal(lines.map((line) => ({ quantity: line.quantity, unitPrice: line.unitPrice })))

  const filteredProducts = search.trim()
    ? products.filter((product) => product.name.toLowerCase().includes(search.trim().toLowerCase()))
    : []

  /**
   * Resuelve los borradores de porcion de pago del modal (tasks.md 7.6) a
   * `SalePaymentInput` reales: una porcion `credito` con `customerName` (en
   * vez de `customerId`) todavia no tiene un cliente real en `customers` --
   * se crea AQUI, antes de `sales:create`, porque `sale_payments.customer_id`
   * es una FK real que exige que el cliente ya exista al momento de insertar
   * la fila de la venta.
   */
  async function resolvePayments(drafts: PaymentDraft[]): Promise<SalePaymentInput[]> {
    const resolved: SalePaymentInput[] = []
    for (const draft of drafts) {
      let customerId = draft.customerId
      if (draft.method === 'credito' && !customerId && draft.customerName) {
        const created = await api.customers.create(draft.customerName)
        customerId = created.id
      }
      resolved.push({ method: draft.method, amount: draft.amount, customerId })
    }
    return resolved
  }

  async function handleConfirmPayment(drafts: PaymentDraft[]): Promise<void> {
    if (!shift) return
    setError(null)
    try {
      const saleLines: SaleLineInput[] = lines.map((line) => ({
        productId: line.productId,
        quantity: line.quantity
      }))
      const payments = await resolvePayments(drafts)
      const sale = await api.sales.create({ shiftId: shift.id, lines: saleLines, payments })

      // Fase 7 (PR4): conecta cada porcion `credito` de la venta al saldo
      // real del cliente en `customer_credits` -- resuelve la limitacion
      // documentada en apply-progress.md "PR3 -> Pendiente para PR4"
      // (`sale_payments` ya guardaba la porcion `credito` desde PR3, pero
      // nunca se reflejaba en el saldo de credito real del cliente).
      for (const payment of sale.payments) {
        if (payment.method === 'credito' && payment.customerId) {
          await api.credit.grant({
            customerId: payment.customerId,
            saleId: sale.id,
            shiftId: shift.id,
            amount: payment.amount
          })
        }
      }

      setCustomers(await api.customers.list())
      setLastSale(sale)
      setLines([])
      setShowPaymentModal(false)

      // Fase 9 (PR4, tasks.md 5.10): imprime el ticket de venta justo
      // despues de cerrarla -- la venta YA quedo guardada en este punto, asi
      // que un fallo de impresion (ticket-printing/spec.md "Impresora no
      // disponible") no debe perder ni revertir la venta, solo mostrar el
      // error y permitir reintentar con el boton "Reimprimir ticket".
      await printSaleTicket(sale.id)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    }
  }

  async function printSaleTicket(saleId: number): Promise<void> {
    setPrintError(null)
    try {
      const result = await api.print.sale(saleId)
      if (!result.printed) {
        setPrintError('Impresion cancelada por el usuario.')
      }
    } catch (caught) {
      setPrintError(
        `No se pudo imprimir el ticket (revisa que la impresora este conectada): ${
          caught instanceof Error ? caught.message : String(caught)
        }`
      )
    }
  }

  if (!shift) {
    return (
      <section>
        <h2>Ventas</h2>
        <p role="alert">
          No hay un turno de caja abierto. Abre un turno en la pantalla de Caja antes de vender.
        </p>
      </section>
    )
  }

  return (
    <section>
      <h2>Ventas</h2>
      {error && <p role="alert">{error}</p>}
      {notFoundNotice && <p role="alert">{notFoundNotice}</p>}
      {lastSale && (
        <p>
          Venta #{lastSale.id} registrada. Total: ${lastSale.total.toFixed(2)}
          <button type="button" onClick={() => printSaleTicket(lastSale.id)}>
            Reimprimir ticket
          </button>
        </p>
      )}
      {printError && <p role="alert">{printError}</p>}

      <p>
        Escanea un codigo de barras (sin foco en ningun campo) o busca un producto por nombre para
        agregarlo a la venta.
      </p>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Buscar producto por nombre"
      />
      <ul>
        {filteredProducts.map((product) => (
          <li key={product.id}>
            {product.name} - ${product.price}
            <button type="button" onClick={() => addLine(product, 1)}>
              Agregar
            </button>
          </li>
        ))}
      </ul>

      <h3>Venta en curso</h3>
      <ul>
        {lines.map((line) => (
          <li key={line.productId}>
            {line.name} x {line.quantity} = ${(line.quantity * line.unitPrice).toFixed(2)}
            <button type="button" onClick={() => removeLine(line.productId)}>
              Quitar
            </button>
          </li>
        ))}
      </ul>
      <p>Total: ${total.toFixed(2)}</p>

      <button type="button" disabled={lines.length === 0} onClick={() => setShowPaymentModal(true)}>
        Cobrar
      </button>

      {showPaymentModal && (
        <SplitPaymentModal
          total={total}
          customers={customers}
          onConfirm={handleConfirmPayment}
          onCancel={() => setShowPaymentModal(false)}
        />
      )}
    </section>
  )
}

export default Ventas
