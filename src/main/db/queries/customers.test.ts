import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../migrate'
import { listCustomers } from './customers'

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
