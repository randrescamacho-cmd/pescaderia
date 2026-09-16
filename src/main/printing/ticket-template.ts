import type { DailyCutReport, SaleTicketData } from '../../shared/ipc-types'

/**
 * CSS obligatorio de 80mm (ticket-printing/spec.md "80mm Paper Width",
 * design.md "Impresion de Tickets"): `@page { size: 80mm auto; margin: 0 }`
 * + cuerpo monospace para que las columnas de cantidad/precio/total se
 * alineen sin recortar informacion critica.
 */
const TICKET_CSS = `
  @page { size: 80mm auto; margin: 0 }
  body { width: 80mm; font-family: monospace; font-size: 12px; margin: 0; padding: 4px; }
  h1, h2 { font-size: 13px; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 1px 0; word-break: break-word; }
  .right { text-align: right; }
  .total { font-weight: bold; }
  .warning { font-weight: bold; }
  hr { border: none; border-top: 1px dashed #000; }
`

/**
 * Escapa caracteres HTML-significativos (nombres de producto/cliente vienen
 * de datos capturados por el usuario -- no deben poder inyectar markup en
 * el HTML que se manda a `webContents.print()`).
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function money(amount: number): string {
  return amount.toFixed(2)
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  credito: 'Credito'
}

function htmlDocument(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${TICKET_CSS}</style>
</head>
<body>
${body}
</body>
</html>`
}

/**
 * `printing/ticket-template.ts` (tasks.md 9.1): ticket de una venta
 * individual. `data` viene de `db/queries/sales.ts` (`getSaleTicketData`),
 * ya enriquecido con nombres de producto/cliente.
 */
export function buildSaleTicketHtml(data: SaleTicketData): string {
  const linesHtml = data.lines
    .map(
      (line) => `<tr>
        <td colspan="3">${escapeHtml(line.productName)}</td>
      </tr>
      <tr>
        <td>${line.quantity}</td>
        <td class="right">$${money(line.unitPrice)}</td>
        <td class="right">$${money(line.lineTotal)}</td>
      </tr>`
    )
    .join('')

  const paymentsHtml = data.payments
    .map((payment) => {
      const label = PAYMENT_METHOD_LABEL[payment.method] ?? payment.method
      const customer = payment.customerName ? ` (${escapeHtml(payment.customerName)})` : ''
      return `<tr><td>${label}${customer}</td><td class="right">$${money(payment.amount)}</td></tr>`
    })
    .join('')

  const body = `
    <h1>Pescaderia Bahia de los Angeles</h1>
    <p>Venta #${data.id} - ${escapeHtml(data.createdAt)}</p>
    <hr />
    <table>${linesHtml}</table>
    <hr />
    <table>${paymentsHtml}</table>
    <hr />
    <p class="total right">Total: $${money(data.total)}</p>
  `

  return htmlDocument(`Venta #${data.id}`, body)
}

/**
 * `printing/ticket-template.ts` (tasks.md 9.2): Corte del Dia con las 9
 * secciones EXACTAS de daily-report/spec.md "Fixed Section Order", en el
 * mismo orden que la pantalla `CorteDelDia.tsx` (tasks.md 8.6).
 */
export function buildDailyCutTicketHtml(report: DailyCutReport): string {
  const cashEntriesRows = report.cashEntriesMovements
    .map((m) => `<tr><td>${escapeHtml(m.concept)}</td><td class="right">$${money(m.amount)}</td></tr>`)
    .join('')

  const supplierRows = report.supplierPayments
    .map(
      (m) =>
        `<tr><td>${escapeHtml(m.concept)}${m.provider ? ` (${escapeHtml(m.provider)})` : ''}</td><td class="right">$${money(m.amount)}</td></tr>`
    )
    .join('')

  const creditPaymentsSection =
    report.creditPayments.length === 0
      ? '<p>NO HUBO PAGOS</p>'
      : `<table>${report.creditPayments
          .map(
            (p) =>
              `<tr><td>${escapeHtml(p.customerName)}</td><td class="right">$${money(p.amount)}</td></tr>`
          )
          .join('')}</table>
        <p class="total right">Total: $${money(report.creditPaymentsTotal)}</p>`

  const departmentRows = report.departmentSales
    .map(
      (d) => `<tr><td>${escapeHtml(d.departmentName)}</td><td class="right">$${money(d.total)}</td></tr>`
    )
    .join('')

  const previewBanner = report.isPreview
    ? `<p class="warning">VISTA PREVIA -- turno #${report.shiftId} todavia abierto</p>`
    : ''

  const uncostedWarning =
    report.uncostedProductCount > 0
      ? `<p class="warning">Advertencia: ${report.uncostedProductCount} producto(s) sin costo capturado (costo $0 usado)</p>`
      : ''

  const body = `
    <h1>Pescaderia Bahia de los Angeles</h1>
    <h2>Corte del Dia - Turno #${report.shiftId}</h2>
    ${previewBanner}
    <hr />
    <h2>1. Entradas efectivo</h2>
    <p>Inicio de caja: $${money(report.cashEntriesOpening)}</p>
    <table>${cashEntriesRows}</table>
    <p class="total right">Total: $${money(report.cashEntriesTotal)}</p>
    <hr />
    <h2>2. Ventas de contado</h2>
    <p class="total right">Total: $${money(report.cashSalesTotal)}</p>
    <hr />
    <h2>3. Salidas / Proveedores</h2>
    <table>${supplierRows}</table>
    <p class="total right">Total: $${money(report.supplierPaymentsTotal)}</p>
    <hr />
    <h2>4. Dinero en caja</h2>
    <p class="total right">$${money(report.cashOnHand)}</p>
    <hr />
    <h2>5. Dinero en bancos</h2>
    <p class="total right">$${money(report.bankTotal)}</p>
    <hr />
    <h2>6. Ventas totales</h2>
    <p class="total right">$${money(report.totalSales)}</p>
    <hr />
    <h2>7. Ganancia del dia</h2>
    <p class="total right">$${money(report.profit)}</p>
    ${uncostedWarning}
    <hr />
    <h2>8. Pagos de creditos</h2>
    ${creditPaymentsSection}
    <hr />
    <h2>9. Ventas por departamento</h2>
    <table>${departmentRows}</table>
  `

  return htmlDocument(`Corte del Dia #${report.shiftId}`, body)
}
