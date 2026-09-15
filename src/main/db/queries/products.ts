import type { DatabaseSync } from 'node:sqlite'
import type { Product, ProductInput } from '../../../shared/ipc-types'

interface ProductRow {
  id: number
  department_id: number
  name: string
  barcode: string | null
  cost: number | null
  price: number
  active: number
}

function mapRow(row: ProductRow): Product {
  return {
    id: row.id,
    departmentId: row.department_id,
    name: row.name,
    barcode: row.barcode,
    cost: row.cost,
    price: row.price,
    active: row.active === 1
  }
}

/**
 * Validacion pura (catalog-management/spec.md "Product Definition"): precio
 * > 0 y departamento obligatorio. Separada de `createProduct`/`updateProduct`
 * para poder testearla sin tocar SQLite (tasks.md 4.5).
 */
export function validateProductInput(input: ProductInput): string[] {
  const errors: string[] = []

  if (!input.name || !input.name.trim()) {
    errors.push('name is required')
  }
  if (!(input.price > 0)) {
    errors.push('price must be greater than 0')
  }
  if (!input.departmentId) {
    errors.push('department is required')
  }

  return errors
}

export function listProducts(db: DatabaseSync, includeInactive = false): Product[] {
  const rows = (
    includeInactive
      ? db.prepare('SELECT * FROM products ORDER BY name').all()
      : db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY name').all()
  ) as unknown as ProductRow[]

  return rows.map(mapRow)
}

export function createProduct(db: DatabaseSync, input: ProductInput): Product {
  const errors = validateProductInput(input)
  if (errors.length > 0) {
    throw new Error(`Producto invalido: ${errors.join(', ')}`)
  }

  const result = db
    .prepare(
      'INSERT INTO products (department_id, name, barcode, cost, price) VALUES (?, ?, ?, ?, ?)'
    )
    .run(input.departmentId, input.name, input.barcode ?? null, input.cost ?? null, input.price)

  return mapRow(
    db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid) as unknown as ProductRow
  )
}

export function updateProduct(db: DatabaseSync, id: number, input: ProductInput): Product {
  const errors = validateProductInput(input)
  if (errors.length > 0) {
    throw new Error(`Producto invalido: ${errors.join(', ')}`)
  }

  db.prepare(
    `UPDATE products
     SET department_id = ?, name = ?, barcode = ?, cost = ?, price = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(input.departmentId, input.name, input.barcode ?? null, input.cost ?? null, input.price, id)

  return mapRow(db.prepare('SELECT * FROM products WHERE id = ?').get(id) as unknown as ProductRow)
}

/** Soft-delete (design.md Decision 6): nunca se borra fisicamente. */
export function deleteProduct(db: DatabaseSync, id: number): { deleted: true } {
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(id)
  return { deleted: true }
}

export function findByBarcode(db: DatabaseSync, barcode: string): Product | null {
  const row = db
    .prepare('SELECT * FROM products WHERE barcode = ? AND active = 1')
    .get(barcode) as unknown as ProductRow | undefined

  return row ? mapRow(row) : null
}
