// Contrato IPC compartido entre main (preload/ipc handlers) y renderer
// (ipc-client.ts). Vive en src/shared/ para evitar duplicar tipos entre
// ambos lados del `contextBridge` (design.md Decision 2). Incluido en ambos
// tsconfig.node.json y tsconfig.web.json.

export type Role = 'usuario' | 'administrador'

export interface LoginResult {
  ok: boolean
  role: Role | null
}

export interface ChangePinInput {
  role: Role
  newPin: string
}

export interface Department {
  id: number
  name: string
  active: boolean
}

export interface DepartmentInput {
  name: string
}

export interface DeleteDepartmentBlocked {
  deleted: false
  blockedByProducts: { id: number; name: string }[]
}

export interface DeleteDepartmentOk {
  deleted: true
}

export type DeleteDepartmentResult = DeleteDepartmentBlocked | DeleteDepartmentOk

export interface Product {
  id: number
  departmentId: number
  name: string
  barcode: string | null
  cost: number | null
  price: number
  active: boolean
}

export interface ProductInput {
  name: string
  price: number
  departmentId: number | null
  cost?: number | null
  barcode?: string | null
}

export interface CatalogApi {
  listDepartments(includeInactive?: boolean): Promise<Department[]>
  createDepartment(input: DepartmentInput): Promise<Department>
  updateDepartment(id: number, input: DepartmentInput): Promise<Department>
  deleteDepartment(id: number): Promise<DeleteDepartmentResult>
  listProducts(includeInactive?: boolean): Promise<Product[]>
  createProduct(input: ProductInput): Promise<Product>
  updateProduct(id: number, input: ProductInput): Promise<Product>
  deleteProduct(id: number): Promise<{ deleted: true }>
  findByBarcode(barcode: string): Promise<Product | null>
}

export interface AuthApi {
  login(pin: string): Promise<LoginResult>
  changePin(input: ChangePinInput): Promise<{ ok: boolean }>
  logout(): Promise<void>
}

// Fase 5 (Ventas). Nota de alcance (ver apply-progress.md "PR3"): una porcion
// de pago 'credito' solo puede asociarse a un cliente YA EXISTENTE en
// `customers` (customer-credit/spec.md "Grant Credit at Sale Time" cubre
// crear cliente nuevo al otorgar credito, pero esa gestion completa -- crear
// cliente, otorgar, pagar, reflejar en corte -- es Fase 7/PR4, fuera de este
// PR). El selector de cliente en el modal de pago dividido es
// deliberadamente simple (lista de clientes ya capturados).
export type PaymentMethod = 'efectivo' | 'tarjeta' | 'credito'

export interface Customer {
  id: number
  name: string
  active: boolean
}

export interface SaleLineInput {
  productId: number
  quantity: number
}

export interface SalePaymentInput {
  method: PaymentMethod
  amount: number
  customerId?: number | null
}

export interface SaleInput {
  shiftId: number
  lines: SaleLineInput[]
  payments: SalePaymentInput[]
}

export interface SaleLineResult {
  id: number
  productId: number
  departmentId: number
  quantity: number
  unitPrice: number
  unitCost: number | null
  lineTotal: number
}

export interface SalePaymentResult {
  id: number
  method: PaymentMethod
  amount: number
  customerId: number | null
}

export interface Sale {
  id: number
  shiftId: number
  subtotal: number
  total: number
  createdAt: string
  lines: SaleLineResult[]
  payments: SalePaymentResult[]
}

export interface SalesApi {
  create(input: SaleInput): Promise<Sale>
}

// Fase 9 (Impresion). `Sale`/`SaleLineResult`/`SalePaymentResult` (PR3) solo
// guardan `productId`/`customerId` -- un ticket impreso necesita el NOMBRE
// del producto/cliente, no el id. `getSaleTicketData` (db/queries/sales.ts)
// enriquece la venta con esos nombres via JOIN, sin tocar el contrato de
// `Sale` ya usado por `sales:create` (PR3, verificado).
export interface SaleTicketLine {
  productName: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface SaleTicketPayment {
  method: PaymentMethod
  amount: number
  customerName: string | null
}

export interface SaleTicketData {
  id: number
  createdAt: string
  total: number
  lines: SaleTicketLine[]
  payments: SaleTicketPayment[]
}

export interface CustomersApi {
  list(): Promise<Customer[]>
  create(name: string): Promise<Customer>
}

// Fase 7 (Creditos de Clientes). Resuelve la limitacion documentada en
// apply-progress.md "PR3 -> Pendiente para PR4": una porcion de venta
// `credito` (ya escrita en `sale_payments` desde PR3) NO reflejaba nada en
// `customer_credits` -- `credit:grant` es el paso que "conecta" ambas tablas
// (ver design.md diagrama de secuencia "Credito de cliente", invoke separado
// despues de `sales:create`).
export interface GrantCreditInput {
  customerId?: number | null
  customerName?: string | null
  saleId?: number | null
  shiftId: number
  amount: number
  note?: string | null
}

export interface GrantCreditResult {
  customer: Customer
  creditId: number
  balance: number
}

export interface PayCreditInput {
  customerId: number
  shiftId: number
  amount: number
  method?: 'efectivo' | 'tarjeta'
}

export interface PayCreditResult {
  paymentId: number
  amount: number
  balance: number
}

export interface CustomerBalance extends Customer {
  balance: number
}

export interface CreditPaymentRecord {
  id: number
  customerId: number
  customerName: string
  amount: number
  createdAt: string
}

export interface CreditApi {
  grant(input: GrantCreditInput): Promise<GrantCreditResult>
  pay(input: PayCreditInput): Promise<PayCreditResult>
  balance(customerId: number): Promise<number>
  listBalances(): Promise<CustomerBalance[]>
}

// Fase 8 (Corte del Dia). daily-report/spec.md "Fixed Section Order": las 9
// secciones exactas, en este orden. Cada campo de abajo corresponde 1:1 a
// una seccion -- ver apply-progress.md "Fase 8" para la justificacion de
// las 2 formulas donde este PR sigue el texto LITERAL de spec.md en vez de
// la sugerencia SQL de design.md (Ventas de contado excluye credito;
// Ventas totales = ventas de contado + pagos de creditos).
export interface DepartmentSalesLine {
  departmentId: number
  departmentName: string
  total: number
}

export interface DailyCutReport {
  shiftId: number
  shiftStatus: 'open' | 'closed'
  isPreview: boolean
  cashEntriesOpening: number
  cashEntriesMovements: CashMovement[]
  cashEntriesTotal: number
  cashSalesTotal: number
  supplierPayments: CashMovement[]
  supplierPaymentsTotal: number
  cashOnHand: number
  bankTotal: number
  totalSales: number
  profit: number
  uncostedProductCount: number
  creditPayments: CreditPaymentRecord[]
  creditPaymentsTotal: number
  departmentSales: DepartmentSalesLine[]
}

export interface ReportsApi {
  dailyCut(shiftId: number): Promise<DailyCutReport>
}

// Fase 9 (Impresion de Tickets). ticket-printing/spec.md: dialogo nativo de
// impresion (`webContents.print()`), 80mm, sin ESC/POS crudo. Ambos metodos
// devuelven `{ printed: true }` en exito; si el usuario CANCELA el dialogo
// nativo, la promesa TAMBIEN resuelve `{ printed: false }` (no es un error --
// ticket-printing/spec.md "Cancelar impresion": la venta/reporte ya
// guardados permanecen intactos). Solo un fallo real (impresora
// desconectada) rechaza la promesa, permitiendo reintentar (tasks.md 9.6).
export interface PrintResult {
  printed: boolean
}

export interface PrintApi {
  sale(saleId: number): Promise<PrintResult>
  dailyCut(shiftId: number): Promise<PrintResult>
}

// Fase 6 (Caja).
export interface Shift {
  id: number
  openedAt: string
  closedAt: string | null
  openedByRoleId: number
  closedByRoleId: number | null
  openingCash: number
  closingCashCounted: number | null
  status: 'open' | 'closed'
}

export type CashMovementType = 'entrada' | 'salida'

export interface CashMovement {
  id: number
  shiftId: number
  type: CashMovementType
  concept: string
  provider: string | null
  amount: number
  createdAt: string
}

export interface CloseShiftResult {
  shift: Shift
  expectedCash: number
  countedCash: number
  difference: number
}

export interface CashApi {
  getOpenShift(): Promise<Shift | null>
  openShift(openingCash: number): Promise<Shift>
  cashIn(shiftId: number, amount: number, concept: string): Promise<CashMovement>
  cashOut(shiftId: number, amount: number, concept: string, provider: string): Promise<CashMovement>
  listMovements(shiftId: number): Promise<CashMovement[]>
  closeShift(shiftId: number, countedCash: number): Promise<CloseShiftResult>
}

export interface PosApi {
  auth: AuthApi
  catalog: CatalogApi
  sales: SalesApi
  cash: CashApi
  customers: CustomersApi
  credit: CreditApi
  reports: ReportsApi
  print: PrintApi
}
