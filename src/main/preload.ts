// Preload del proceso principal (design.md: vive en src/main/preload.ts, no
// en el src/preload/ default de electron-vite). `contextIsolation: true` +
// `nodeIntegration: false` (design.md Decision 2) hacen que este sea el
// UNICO puente entre el renderer y Node/Electron.
//
// Fase 3 llena el bridge con la API real de auth + catalogo
// (`contextBridge.exposeInMainWorld('api', { ... })`). Fases posteriores
// (ventas, caja, creditos, impresion) agregaran mas namespaces al mismo
// objeto `api`.
import { contextBridge, ipcRenderer } from 'electron'
import type {
  ChangePinInput,
  DepartmentInput,
  PosApi,
  ProductInput,
  SaleInput
} from '../shared/ipc-types'

const api: PosApi = {
  auth: {
    login: (pin: string) => ipcRenderer.invoke('auth:login', pin),
    changePin: (input: ChangePinInput) => ipcRenderer.invoke('auth:changePin', input),
    logout: () => ipcRenderer.invoke('auth:logout')
  },
  catalog: {
    listDepartments: (includeInactive?: boolean) =>
      ipcRenderer.invoke('catalog:listDepartments', includeInactive),
    createDepartment: (input: DepartmentInput) => ipcRenderer.invoke('catalog:createDepartment', input),
    updateDepartment: (id: number, input: DepartmentInput) =>
      ipcRenderer.invoke('catalog:updateDepartment', id, input),
    deleteDepartment: (id: number) => ipcRenderer.invoke('catalog:deleteDepartment', id),
    listProducts: (includeInactive?: boolean) => ipcRenderer.invoke('catalog:listProducts', includeInactive),
    createProduct: (input: ProductInput) => ipcRenderer.invoke('catalog:createProduct', input),
    updateProduct: (id: number, input: ProductInput) => ipcRenderer.invoke('catalog:updateProduct', id, input),
    deleteProduct: (id: number) => ipcRenderer.invoke('catalog:deleteProduct', id),
    findByBarcode: (barcode: string) => ipcRenderer.invoke('catalog:findByBarcode', barcode)
  },
  sales: {
    create: (input: SaleInput) => ipcRenderer.invoke('sales:create', input)
  },
  cash: {
    getOpenShift: () => ipcRenderer.invoke('cash:getOpenShift'),
    openShift: (openingCash: number) => ipcRenderer.invoke('cash:openShift', openingCash),
    cashIn: (shiftId: number, amount: number, concept: string) =>
      ipcRenderer.invoke('cash:cashIn', shiftId, amount, concept),
    cashOut: (shiftId: number, amount: number, concept: string, provider: string) =>
      ipcRenderer.invoke('cash:cashOut', shiftId, amount, concept, provider),
    listMovements: (shiftId: number) => ipcRenderer.invoke('cash:listMovements', shiftId),
    closeShift: (shiftId: number, countedCash: number) =>
      ipcRenderer.invoke('cash:closeShift', shiftId, countedCash)
  },
  customers: {
    list: () => ipcRenderer.invoke('customers:list')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error -- fallback solo si contextIsolation estuviera deshabilitado
  window.api = api
}
