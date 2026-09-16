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

export interface CustomersApi {
  list(): Promise<Customer[]>
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
}
