import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../migrate'
import { listDepartments } from './departments'
import {
  createProduct,
  deleteProduct,
  findByBarcode,
  getProductById,
  listProducts,
  updateProduct,
  validateProductInput
} from './products'

function openMigratedDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true })
  runMigrations(db)
  return db
}

function mariscosDepartmentId(db: DatabaseSync): number {
  return listDepartments(db).find((d) => d.name === 'Mariscos')!.id
}

describe('validateProductInput', () => {
  it('returns no errors for a valid product', () => {
    expect(validateProductInput({ name: 'Camaron', price: 120, departmentId: 1 })).toEqual([])
  })

  it('rejects a product without a department', () => {
    const errors = validateProductInput({ name: 'Camaron', price: 120, departmentId: null })

    expect(errors).toContain('department is required')
  })

  it('rejects a product with price <= 0', () => {
    const errors = validateProductInput({ name: 'Camaron', price: 0, departmentId: 1 })

    expect(errors).toContain('price must be greater than 0')
  })
})

describe('createProduct', () => {
  it('creates a valid product with cost, price and a fixed department', () => {
    const db = openMigratedDb()
    const departmentId = mariscosDepartmentId(db)

    const product = createProduct(db, { name: 'Camaron', price: 120, cost: 80, departmentId })

    expect(product.name).toBe('Camaron')
    expect(product.price).toBe(120)
    expect(product.cost).toBe(80)
    expect(product.departmentId).toBe(departmentId)
  })

  it('creates a product with no cost captured (cost stays null)', () => {
    const db = openMigratedDb()
    const departmentId = mariscosDepartmentId(db)

    const product = createProduct(db, { name: 'Souvenir llavero', price: 50, departmentId })

    expect(product.cost).toBeNull()
  })

  it('throws when department is missing', () => {
    const db = openMigratedDb()

    expect(() => createProduct(db, { name: 'Camaron', price: 120, departmentId: null })).toThrow()
  })

  it('throws when price is not greater than 0', () => {
    const db = openMigratedDb()
    const departmentId = mariscosDepartmentId(db)

    expect(() => createProduct(db, { name: 'Camaron', price: 0, departmentId })).toThrow()
  })
})

describe('updateProduct', () => {
  it('reassigns a product to a different (single, fixed) department', () => {
    const db = openMigratedDb()
    const mariscos = mariscosDepartmentId(db)
    const pescado = listDepartments(db).find((d) => d.name === 'Venta de Pescado')!.id
    const product = createProduct(db, { name: 'Camaron', price: 120, departmentId: mariscos })

    const updated = updateProduct(db, product.id, { name: 'Camaron', price: 120, departmentId: pescado })

    expect(updated.departmentId).toBe(pescado)
  })
})

describe('deleteProduct', () => {
  it('soft-deletes a product (active becomes false, but the row remains for history)', () => {
    const db = openMigratedDb()
    const departmentId = mariscosDepartmentId(db)
    const product = createProduct(db, { name: 'Camaron', price: 120, departmentId })

    deleteProduct(db, product.id)

    expect(listProducts(db).some((p) => p.id === product.id)).toBe(false)
    expect(listProducts(db, true).some((p) => p.id === product.id)).toBe(true)
  })
})

describe('findByBarcode', () => {
  it('finds an active product by its exact barcode', () => {
    const db = openMigratedDb()
    const departmentId = mariscosDepartmentId(db)
    createProduct(db, { name: 'Camaron', price: 120, departmentId, barcode: '7501234567890' })

    const found = findByBarcode(db, '7501234567890')

    expect(found?.name).toBe('Camaron')
  })

  it('returns null when no product matches the barcode', () => {
    const db = openMigratedDb()

    expect(findByBarcode(db, '0000000000000')).toBeNull()
  })
})

describe('getProductById', () => {
  it('returns an active product by its id (used by sales:create to snapshot price/cost/department)', () => {
    const db = openMigratedDb()
    const departmentId = mariscosDepartmentId(db)
    const product = createProduct(db, { name: 'Camaron', price: 120, cost: 80, departmentId })

    const found = getProductById(db, product.id)

    expect(found?.name).toBe('Camaron')
    expect(found?.price).toBe(120)
    expect(found?.cost).toBe(80)
  })

  it('returns null for a soft-deleted (inactive) product id', () => {
    const db = openMigratedDb()
    const departmentId = mariscosDepartmentId(db)
    const product = createProduct(db, { name: 'Camaron', price: 120, departmentId })
    deleteProduct(db, product.id)

    expect(getProductById(db, product.id)).toBeNull()
  })

  it('returns null for a nonexistent id', () => {
    const db = openMigratedDb()

    expect(getProductById(db, 999999)).toBeNull()
  })
})
