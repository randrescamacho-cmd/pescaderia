import type { IpcMain } from 'electron'
import type { DatabaseSync } from 'node:sqlite'
import { assertRole, type SessionStore } from '../auth/session'
import {
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment
} from '../db/queries/departments'
import {
  createProduct,
  deleteProduct,
  findByBarcode,
  listProducts,
  updateProduct
} from '../db/queries/products'
import type { DepartmentInput, ProductInput } from '../../shared/ipc-types'

/**
 * Wiring de `ipcMain.handle` para `catalog:*` (tasks.md 4.1-4.4). Igual que
 * `ipc/auth.ts`: capa fina sin logica propia. El guard de rol
 * (auth-roles/spec.md "Administrator-Only Actions") se aplica AQUI, antes de
 * llamar a las funciones de `db/queries/*`, para que ninguna mutacion de
 * catalogo pueda ejecutarse sin sesion de Administrador -- las lecturas
 * (listDepartments, listProducts, findByBarcode) quedan sin guard porque el
 * rol Usuario las necesita para vender (escaneo de codigo de barras, Fase 5).
 */
export function registerCatalogIpc(ipcMain: IpcMain, db: DatabaseSync, session: SessionStore): void {
  ipcMain.handle('catalog:listDepartments', (_event, includeInactive?: boolean) =>
    listDepartments(db, includeInactive)
  )

  ipcMain.handle('catalog:createDepartment', (_event, input: DepartmentInput) => {
    assertRole(session.getRole(), 'administrador')
    return createDepartment(db, input.name)
  })

  ipcMain.handle('catalog:updateDepartment', (_event, id: number, input: DepartmentInput) => {
    assertRole(session.getRole(), 'administrador')
    return updateDepartment(db, id, input.name)
  })

  ipcMain.handle('catalog:deleteDepartment', (_event, id: number) => {
    assertRole(session.getRole(), 'administrador')
    return deleteDepartment(db, id)
  })

  ipcMain.handle('catalog:listProducts', (_event, includeInactive?: boolean) =>
    listProducts(db, includeInactive)
  )

  ipcMain.handle('catalog:createProduct', (_event, input: ProductInput) => {
    assertRole(session.getRole(), 'administrador')
    return createProduct(db, input)
  })

  ipcMain.handle('catalog:updateProduct', (_event, id: number, input: ProductInput) => {
    assertRole(session.getRole(), 'administrador')
    return updateProduct(db, id, input)
  })

  ipcMain.handle('catalog:deleteProduct', (_event, id: number) => {
    assertRole(session.getRole(), 'administrador')
    return deleteProduct(db, id)
  })

  ipcMain.handle('catalog:findByBarcode', (_event, barcode: string) => findByBarcode(db, barcode))
}
