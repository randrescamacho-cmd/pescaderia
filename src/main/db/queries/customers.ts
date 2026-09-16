import type { DatabaseSync } from 'node:sqlite'
import type { Customer } from '../../../shared/ipc-types'

interface CustomerRow {
  id: number
  name: string
  active: number
}

function mapRow(row: CustomerRow): Customer {
  return { id: row.id, name: row.name, active: row.active === 1 }
}

/**
 * Lectura de clientes ya capturados (tasks.md Fase 5, selector simple de
 * cliente para una porcion de pago `credito` -- ver nota de alcance en
 * `shared/ipc-types.ts`). Fase 7/PR4 agrega `createCustomer` para el flujo
 * de "crear cliente nuevo" (tasks.md 7.6/7.1) -- este PR ya no depende
 * exclusivamente de clientes precargados manualmente.
 */
export function listCustomers(db: DatabaseSync): Customer[] {
  const rows = db
    .prepare('SELECT * FROM customers WHERE active = 1 ORDER BY name')
    .all() as unknown as CustomerRow[]

  return rows.map(mapRow)
}

/**
 * Crea un cliente nuevo (customer-credit/spec.md "Registrar cliente nuevo
 * al otorgar credito"). Usada tanto por `customers:create` (IPC usado por el
 * picker/creator inline del modal de pago dividido, tasks.md 7.6) como por
 * `db/queries/credits.ts` (`grantCredit`, resuelve un cliente por nombre si
 * no existe todavia).
 */
export function createCustomer(db: DatabaseSync, name: string): Customer {
  if (!name || !name.trim()) {
    throw new Error('El nombre del cliente es obligatorio')
  }

  const result = db.prepare('INSERT INTO customers (name) VALUES (?)').run(name.trim())

  return mapRow(
    db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid) as unknown as CustomerRow
  )
}

/** Usada por `sale_payments.customer_id`/`credit:grant` para validar un cliente elegido. Solo activos. */
export function getCustomerById(db: DatabaseSync, id: number): Customer | null {
  const row = db
    .prepare('SELECT * FROM customers WHERE id = ? AND active = 1')
    .get(id) as unknown as CustomerRow | undefined

  return row ? mapRow(row) : null
}

/**
 * Busca un cliente activo por nombre exacto -- usada por `grantCredit` para
 * evitar crear un cliente duplicado si el cajero vuelve a escribir el mismo
 * nombre de un cliente ya capturado.
 */
export function findCustomerByName(db: DatabaseSync, name: string): Customer | null {
  const row = db
    .prepare('SELECT * FROM customers WHERE name = ? AND active = 1')
    .get(name) as unknown as CustomerRow | undefined

  return row ? mapRow(row) : null
}
