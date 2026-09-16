import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../migrate'
import { createCustomer, findCustomerByName, getCustomerById, listCustomers } from './customers'

function openMigratedDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true })
  runMigrations(db)
  return db
}

describe('listCustomers', () => {
  it('returns an empty list when no customers have been captured yet', () => {
    const db = openMigratedDb()

    expect(listCustomers(db)).toEqual([])
  })

  it('lists active customers ordered by name (selector for credito portion)', () => {
    const db = openMigratedDb()
    db.prepare('INSERT INTO customers (name) VALUES (?)').run('Don Beto')
    db.prepare('INSERT INTO customers (name) VALUES (?)').run('Dona Rosa')

    const customers = listCustomers(db)

    expect(customers.map((c) => c.name)).toEqual(['Don Beto', 'Dona Rosa'])
    expect(customers.every((c) => c.active)).toBe(true)
  })

  it('excludes inactive customers', () => {
    const db = openMigratedDb()
    const result = db.prepare('INSERT INTO customers (name) VALUES (?)').run('Cliente Viejo')
    db.prepare('UPDATE customers SET active = 0 WHERE id = ?').run(result.lastInsertRowid)

    expect(listCustomers(db)).toEqual([])
  })
})

describe('createCustomer', () => {
  it('creates a new active customer with the given name (customer-credit spec: "Registrar cliente nuevo al otorgar credito")', () => {
    const db = openMigratedDb()

    const customer = createCustomer(db, 'Don Beto')

    expect(customer.name).toBe('Don Beto')
    expect(customer.active).toBe(true)
    expect(listCustomers(db).map((c) => c.name)).toEqual(['Don Beto'])
  })

  it('rejects an empty name', () => {
    const db = openMigratedDb()

    expect(() => createCustomer(db, '')).toThrow()
  })

  it('rejects a name that is only whitespace', () => {
    const db = openMigratedDb()

    expect(() => createCustomer(db, '   ')).toThrow()
  })
})

describe('getCustomerById', () => {
  it('returns an active customer by id', () => {
    const db = openMigratedDb()
    const created = createCustomer(db, 'Dona Rosa')

    expect(getCustomerById(db, created.id)?.name).toBe('Dona Rosa')
  })

  it('returns null for a nonexistent id', () => {
    const db = openMigratedDb()

    expect(getCustomerById(db, 999999)).toBeNull()
  })

  it('returns null for an inactive customer', () => {
    const db = openMigratedDb()
    const created = createCustomer(db, 'Cliente Viejo')
    db.prepare('UPDATE customers SET active = 0 WHERE id = ?').run(created.id)

    expect(getCustomerById(db, created.id)).toBeNull()
  })
})

describe('findCustomerByName', () => {
  it('finds an active customer by exact name match', () => {
    const db = openMigratedDb()
    createCustomer(db, 'Don Beto')

    expect(findCustomerByName(db, 'Don Beto')?.name).toBe('Don Beto')
  })

  it('returns null when no active customer matches the name', () => {
    const db = openMigratedDb()

    expect(findCustomerByName(db, 'Nadie')).toBeNull()
  })
})
