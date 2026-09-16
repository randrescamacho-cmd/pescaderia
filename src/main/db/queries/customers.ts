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
 * `shared/ipc-types.ts`). NO expone crear/editar cliente: eso pertenece a
 * `credit:grant` (tasks.md 7.1, Fase 7/PR4, "create customer if new").
 */
export function listCustomers(db: DatabaseSync): Customer[] {
  const rows = db
    .prepare('SELECT * FROM customers WHERE active = 1 ORDER BY name')
    .all() as unknown as CustomerRow[]

  return rows.map(mapRow)
}
