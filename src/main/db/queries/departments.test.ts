import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../migrate'
import { createDepartment, deleteDepartment, listDepartments, updateDepartment } from './departments'
import { createProduct } from './products'

function openMigratedDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true })
  runMigrations(db)
  return db
}

describe('listDepartments', () => {
  it('lists only active departments by default (the 9 seeded ones)', () => {
    const db = openMigratedDb()

    const departments = listDepartments(db)

    expect(departments).toHaveLength(9)
    expect(departments.every((d) => d.active)).toBe(true)
  })
})

describe('createDepartment', () => {
  it('creates a new department that becomes available for products', () => {
    const db = openMigratedDb()

    const department = createDepartment(db, 'Ferreteria')

    expect(department.name).toBe('Ferreteria')
    expect(department.active).toBe(true)
    expect(listDepartments(db)).toHaveLength(10)
  })
})

describe('updateDepartment', () => {
  it('renames an existing department', () => {
    const db = openMigratedDb()
    const created = createDepartment(db, 'Temporal')

    const updated = updateDepartment(db, created.id, 'Ferreteria y Herramientas')

    expect(updated.name).toBe('Ferreteria y Herramientas')
  })
})

describe('deleteDepartment', () => {
  it('rejects deletion and lists the blocking products when active products are assigned', () => {
    const db = openMigratedDb()
    const department = createDepartment(db, 'Ferreteria')
    createProduct(db, { name: 'Martillo', price: 150, departmentId: department.id })

    const result = deleteDepartment(db, department.id)

    expect(result.deleted).toBe(false)
    if (!result.deleted) {
      expect(result.blockedByProducts.map((p) => p.name)).toEqual(['Martillo'])
    }
    expect(listDepartments(db).some((d) => d.id === department.id)).toBe(true)
  })

  it('soft-deletes a department with no active products assigned', () => {
    const db = openMigratedDb()
    const department = createDepartment(db, 'Ferreteria')

    const result = deleteDepartment(db, department.id)

    expect(result.deleted).toBe(true)
    expect(listDepartments(db).some((d) => d.id === department.id)).toBe(false)
  })
})
