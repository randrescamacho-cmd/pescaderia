import { describe, expect, it } from 'vitest'
import type { DailyCutReport, SaleTicketData } from '../../shared/ipc-types'
import { buildDailyCutTicketHtml, buildSaleTicketHtml } from './ticket-template'

function sampleSale(overrides: Partial<SaleTicketData> = {}): SaleTicketData {
  return {
    id: 42,
    createdAt: '2026-09-15 12:00:00',
    total: 240,
    lines: [{ productName: 'Camaron Grande', quantity: 2, unitPrice: 120, lineTotal: 240 }],
    payments: [{ method: 'efectivo', amount: 240, customerName: null }],
    ...overrides
  }
}

function sampleReport(overrides: Partial<DailyCutReport> = {}): DailyCutReport {
  return {
    shiftId: 7,
    shiftStatus: 'closed',
    isPreview: false,
    cashEntriesOpening: 500,
    cashEntriesMovements: [
      { id: 1, shiftId: 7, type: 'entrada', concept: 'cambio', provider: null, amount: 200, createdAt: '' }
    ],
    cashEntriesTotal: 700,
    cashSalesTotal: 350,
    supplierPayments: [
      { id: 2, shiftId: 7, type: 'salida', concept: 'hielo', provider: 'Hielera del Puerto', amount: 300, createdAt: '' }
    ],
    supplierPaymentsTotal: 300,
    cashOnHand: 600,
    bankTotal: 150,
    totalSales: 500,
    profit: 230,
    uncostedProductCount: 1,
    creditPayments: [{ id: 1, customerId: 1, customerName: 'Dona Rosa', amount: 100, createdAt: '' }],
    creditPaymentsTotal: 100,
    departmentSales: [{ departmentId: 1, departmentName: 'Mariscos', total: 200 }],
    ...overrides
  }
}

describe('buildSaleTicketHtml', () => {
  it('includes the 80mm print CSS required by ticket-printing/spec.md', () => {
    const html = buildSaleTicketHtml(sampleSale())

    expect(html).toContain('@page { size: 80mm auto; margin: 0 }')
    expect(html).toContain('font-family: monospace')
  })

  it('includes product name, quantity, unit price and line total without clipping', () => {
    const html = buildSaleTicketHtml(sampleSale())

    expect(html).toContain('Camaron Grande')
    expect(html).toContain('2')
    expect(html).toContain('120.00')
    expect(html).toContain('240.00')
  })

  it('shows the payment method and amount for each portion, including customer name for credito', () => {
    const html = buildSaleTicketHtml(
      sampleSale({
        total: 340,
        payments: [
          { method: 'efectivo', amount: 240, customerName: null },
          { method: 'credito', amount: 100, customerName: 'Dona Rosa' }
        ]
      })
    )

    expect(html).toContain('Efectivo')
    expect(html).toContain('240.00')
    expect(html).toContain('Credito')
    expect(html).toContain('Dona Rosa')
    expect(html).toContain('100.00')
  })

  it('escapes HTML-significant characters in product names (defense against injected data)', () => {
    const html = buildSaleTicketHtml(
      sampleSale({ lines: [{ productName: '<script>alert(1)</script>', quantity: 1, unitPrice: 10, lineTotal: 10 }] })
    )

    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('includes the sale id and total', () => {
    const html = buildSaleTicketHtml(sampleSale({ id: 99, total: 240 }))

    expect(html).toContain('99')
    expect(html).toContain('240.00')
  })
})

describe('buildDailyCutTicketHtml', () => {
  it('includes the 80mm print CSS required by ticket-printing/spec.md', () => {
    const html = buildDailyCutTicketHtml(sampleReport())

    expect(html).toContain('@page { size: 80mm auto; margin: 0 }')
  })

  it('presents the 9 sections in the exact fixed order (daily-report/spec.md)', () => {
    const html = buildDailyCutTicketHtml(sampleReport())
    const sections = [
      'Entradas efectivo',
      'Ventas de contado',
      'Salidas',
      'Dinero en caja',
      'Dinero en bancos',
      'Ventas totales',
      'Ganancia del dia',
      'Pagos de creditos',
      'Ventas por departamento'
    ]

    let lastIndex = -1
    for (const section of sections) {
      const index = html.indexOf(section)
      expect(index).toBeGreaterThan(lastIndex)
      lastIndex = index
    }
  })

  it('shows the visible warning for uncosted products in the profit section', () => {
    const html = buildDailyCutTicketHtml(sampleReport({ uncostedProductCount: 3 }))

    expect(html).toMatch(/3.*sin costo|sin costo.*3/)
  })

  it('does not show the uncosted-product warning when the count is 0', () => {
    const html = buildDailyCutTicketHtml(sampleReport({ uncostedProductCount: 0 }))

    expect(html).not.toContain('sin costo')
  })

  it('shows the literal "NO HUBO PAGOS" when there were no credit payments this shift', () => {
    const html = buildDailyCutTicketHtml(sampleReport({ creditPayments: [], creditPaymentsTotal: 0 }))

    expect(html).toContain('NO HUBO PAGOS')
  })

  it('lists each credit payment with customer name and amount when there were payments', () => {
    const html = buildDailyCutTicketHtml(sampleReport())

    expect(html).toContain('Dona Rosa')
    expect(html).toContain('100.00')
  })

  it('lists department sales totals', () => {
    const html = buildDailyCutTicketHtml(sampleReport())

    expect(html).toContain('Mariscos')
    expect(html).toContain('200.00')
  })

  it('shows a preview banner when the shift is still open', () => {
    const html = buildDailyCutTicketHtml(sampleReport({ isPreview: true, shiftStatus: 'open' }))

    expect(html).toMatch(/vista previa|preview/i)
  })

  it('does not show a preview banner for a closed shift', () => {
    const html = buildDailyCutTicketHtml(sampleReport({ isPreview: false, shiftStatus: 'closed' }))

    expect(html).not.toMatch(/vista previa/i)
  })
})
