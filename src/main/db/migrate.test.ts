import { scryptSync, timingSafeEqual } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from './migrate'

function openTestDb(): DatabaseSync {
  return new DatabaseSync(':memory:', { enableForeignKeyConstraints: true })
}

describe('runMigrations', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = openTestDb()
  })

  it('applies every migration in order and records them in schema_migrations', () => {
    const result = runMigrations(db)

    expect(result.applied).toEqual([1, 2, 3])

    const rows = db
      .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
      .all() as { version: number; name: string }[]

    expect(rows).toEqual([
      { version: 1, name: 'init' },
      { version: 2, name: 'seed_roles' },
      { version: 3, name: 'seed_departments' }
    ])
  })

  it('is idempotent: running twice does not reapply already-applied versions', () => {
    runMigrations(db)
    const second = runMigrations(db)

    expect(second.applied).toEqual([])

    const count = db.prepare('SELECT COUNT(*) as total FROM schema_migrations').get() as {
      total: number
    }
    expect(count.total).toBe(3)
  })

  it('creates all tables required by the 7 specs (catalog, sales, cash, credit)', () => {
    runMigrations(db)

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name)

    expect(tables).toEqual(
      expect.arrayContaining([
        'roles',
        'departments',
        'products',
        'customers',
        'shifts',
        'cash_movements',
        'sales',
        'sale_lines',
        'sale_payments',
        'customer_credits',
        'credit_payments',
        'schema_migrations'
      ])
    )
  })

  it('seeds exactly the 2 roles (usuario/administrador) with a working scrypt hash', () => {
    runMigrations(db)

    const roles = db.prepare('SELECT name, pin_salt, pin_hash FROM roles ORDER BY name').all() as {
      name: string
      pin_salt: string
      pin_hash: string
    }[]

    expect(roles.map((r) => r.name)).toEqual(['administrador', 'usuario'])

    const admin = roles.find((r) => r.name === 'administrador')!
    const computedHash = scryptSync('9999', admin.pin_salt, 64)
    expect(timingSafeEqual(computedHash, Buffer.from(admin.pin_hash, 'hex'))).toBe(true)

    const usuario = roles.find((r) => r.name === 'usuario')!
    const wrongHash = scryptSync('0000', usuario.pin_salt, 64)
    expect(timingSafeEqual(wrongHash, Buffer.from(usuario.pin_hash, 'hex'))).toBe(false)
  })

  it('seeds the 9 known departments from config.yaml business context', () => {
    runMigrations(db)

    const names = db
      .prepare('SELECT name FROM departments ORDER BY name')
      .all()
      .map((row) => (row as { name: string }).name)

    expect(names).toEqual(
      [
        'Coca Cola',
        'Dulces',
        'Juguetes',
        'Mariscos',
        'Ropa y Accesorios',
        'Saldos',
        'Sodas',
        'Souvenir',
        'Venta de Pescado'
      ].sort()
    )
  })

  it('enforces foreign keys: inserting a product with an unknown department_id throws', () => {
    runMigrations(db)

    expect(() => {
      db.exec(
        "INSERT INTO products (department_id, name, price) VALUES (999999, 'Camaron', 120)"
      )
    }).toThrow()
  })

  it('allows a sale_payments row of type credito linked to a customer (split-tender)', () => {
    runMigrations(db)

    db.exec("INSERT INTO customers (name) VALUES ('Dona Rosa')")
    db.exec(
      "INSERT INTO shifts (opened_by_role_id, opening_cash) VALUES (1, 500)"
    )
    db.exec(
      "INSERT INTO sales (shift_id, subtotal, total) VALUES (1, 250, 250)"
    )

    expect(() => {
      db.exec(
        "INSERT INTO sale_payments (sale_id, method, amount, customer_id) VALUES (1, 'credito', 250, 1)"
      )
    }).not.toThrow()

    const payment = db.prepare('SELECT method, customer_id FROM sale_payments WHERE sale_id = 1').get() as {
      method: string
      customer_id: number
    }
    expect(payment.method).toBe('credito')
    expect(payment.customer_id).toBe(1)
  })

  it('rejects a sale_payments row with an invalid method via CHECK constraint', () => {
    runMigrations(db)

    db.exec("INSERT INTO shifts (opened_by_role_id, opening_cash) VALUES (1, 500)")
    db.exec("INSERT INTO sales (shift_id, subtotal, total) VALUES (1, 100, 100)")

    expect(() => {
      db.exec("INSERT INTO sale_payments (sale_id, method, amount) VALUES (1, 'bitcoin', 100)")
    }).toThrow()
  })

  it('allows products.cost to be NULL to represent "sin costo capturado"', () => {
    runMigrations(db)

    expect(() => {
      db.exec(
        "INSERT INTO products (department_id, name, price) VALUES (1, 'Souvenir llavero', 50)"
      )
    }).not.toThrow()

    const product = db
      .prepare("SELECT cost FROM products WHERE name = 'Souvenir llavero'")
      .get() as { cost: number | null }
    expect(product.cost).toBeNull()
  })

  it('allows cash_movements salida rows to store a provider name separate from concept', () => {
    runMigrations(db)

    db.exec("INSERT INTO shifts (opened_by_role_id, opening_cash) VALUES (1, 500)")
    db.exec(
      "INSERT INTO cash_movements (shift_id, type, concept, provider, amount) VALUES (1, 'salida', 'compra de hielo', 'Hielera del Puerto', 300)"
    )

    const movement = db
      .prepare("SELECT concept, provider, amount FROM cash_movements WHERE type = 'salida'")
      .get() as { concept: string; provider: string; amount: number }

    expect(movement.provider).toBe('Hielera del Puerto')
    expect(movement.concept).toBe('compra de hielo')
  })
})
