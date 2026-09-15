import type { DatabaseSync } from 'node:sqlite'
import type { Department, DeleteDepartmentResult } from '../../../shared/ipc-types'

interface DepartmentRow {
  id: number
  name: string
  active: number
}

function mapRow(row: DepartmentRow): Department {
  return { id: row.id, name: row.name, active: row.active === 1 }
}

export function listDepartments(db: DatabaseSync, includeInactive = false): Department[] {
  const rows = (
    includeInactive
      ? db.prepare('SELECT * FROM departments ORDER BY name').all()
      : db.prepare('SELECT * FROM departments WHERE active = 1 ORDER BY name').all()
  ) as unknown as DepartmentRow[]

  return rows.map(mapRow)
}

export function createDepartment(db: DatabaseSync, name: string): Department {
  const result = db.prepare('INSERT INTO departments (name) VALUES (?)').run(name)

  return mapRow(
    db.prepare('SELECT * FROM departments WHERE id = ?').get(result.lastInsertRowid) as unknown as DepartmentRow
  )
}

export function updateDepartment(db: DatabaseSync, id: number, name: string): Department {
  db.prepare('UPDATE departments SET name = ? WHERE id = ?').run(name, id)

  return mapRow(db.prepare('SELECT * FROM departments WHERE id = ?').get(id) as unknown as DepartmentRow)
}

/**
 * Soft-delete de departamento (design.md Decision 6), bloqueado si tiene
 * productos ACTIVOS asignados (catalog-management/spec.md "Eliminar un
 * departamento con productos asignados"). Devuelve la lista de productos que
 * bloquean para que el renderer pueda mostrarlos (tasks.md 4.7) en vez de
 * solo un error generico.
 */
export function deleteDepartment(db: DatabaseSync, id: number): DeleteDepartmentResult {
  const blockingProducts = db
    .prepare('SELECT id, name FROM products WHERE department_id = ? AND active = 1')
    .all(id) as unknown as { id: number; name: string }[]

  if (blockingProducts.length > 0) {
    return { deleted: false, blockedByProducts: blockingProducts }
  }

  db.prepare('UPDATE departments SET active = 0 WHERE id = ?').run(id)
  return { deleted: true }
}
