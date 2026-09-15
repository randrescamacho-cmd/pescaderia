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

export interface PosApi {
  auth: AuthApi
  catalog: CatalogApi
}
