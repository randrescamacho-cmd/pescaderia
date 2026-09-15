import { hashPin } from '../../auth/pin'

export interface Migration {
  version: number
  name: string
  sql: string[]
}

/**
 * Seed de PIN placeholder para el seed inicial de roles (migracion 2).
 *
 * REFACTOR (PR2): reusa `hashPin` de `src/main/auth/pin.ts` (mismo mecanismo
 * scryptSync + salt aleatorio, design.md Decision 4) en vez de duplicar la
 * logica de hashing que PR1 habia inlineado aqui por necesidad de orden
 * (esta migracion se escribio antes de que existiera el modulo de auth
 * reutilizable -- ver apply-progress.md "Pendiente para PR2").
 *
 * Los PIN de placeholder (usuario=1111, administrador=9999) DEBEN cambiarse
 * en el primer uso real -- Fase 3 fuerza/recomienda ese cambio desde la
 * pantalla de Administrador (`auth:changePin`, tasks.md 3.5).
 */
function seedRolesSql(): string[] {
  const usuario = hashPin('1111')
  const administrador = hashPin('9999')

  return [
    `INSERT INTO roles (name, pin_salt, pin_hash) VALUES ('usuario', '${usuario.salt}', '${usuario.hash}')`,
    `INSERT INTO roles (name, pin_salt, pin_hash) VALUES ('administrador', '${administrador.salt}', '${administrador.hash}')`
  ]
}

// Departamentos conocidos segun openspec/config.yaml (contexto de negocio) --
// nota: catalog-management/spec.md lista 8 de estos 9 y omite "Juguetes",
// pero config.yaml (fuente de verdad del contexto de negocio) SI lo incluye.
// Se usa la lista de 9 (superset) por ser la mas completa y evitar perder un
// departamento real de la tienda. Ver apply-progress.md "Deviations".
const KNOWN_DEPARTMENTS = [
  'Saldos',
  'Juguetes',
  'Ropa y Accesorios',
  'Dulces',
  'Sodas',
  'Venta de Pescado',
  'Mariscos',
  'Souvenir',
  'Coca Cola'
]

function seedDepartmentsSql(): string[] {
  return KNOWN_DEPARTMENTS.map(
    (name) => `INSERT INTO departments (name) VALUES ('${name.replace(/'/g, "''")}')`
  )
}

/**
 * Esquema y migraciones versionadas como array TypeScript embebido
 * (design.md Decision 5) -- nunca archivos .sql sueltos cargados en runtime.
 * Reglas para migraciones futuras: solo CREATE TABLE / ALTER TABLE ADD
 * COLUMN, nunca DROP/RENAME (ver design.md "Migraciones de Esquema" y el
 * Rollback Plan del proposal).
 */
export const migrations: Migration[] = [
  {
    version: 1,
    name: 'init',
    sql: [
      `CREATE TABLE roles (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE CHECK(name IN ('usuario','administrador')),
        pin_salt TEXT NOT NULL,
        pin_hash TEXT NOT NULL
      )`,
      `CREATE TABLE departments (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      // Deviation vs design.md: 'cost' es NULLABLE (no NOT NULL). El esquema
      // original de design.md lo declaraba NOT NULL, pero
      // catalog-management/spec.md y daily-report/spec.md requieren
      // distinguir "costo capturado como 0" de "costo NO capturado" para
      // poder mostrar la advertencia de "productos sin costo" -- NULL
      // representa "no capturado"; el calculo de ganancia lo trata como 0.
      `CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        department_id INTEGER NOT NULL REFERENCES departments(id),
        name TEXT NOT NULL,
        barcode TEXT UNIQUE,
        cost REAL,
        price REAL NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT
      )`,
      // Reordenada antes de shifts/sales/etc. (vs. el orden de design.md) para
      // que sale_payments y customer_credits puedan referenciarla por FK.
      `CREATE TABLE customers (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE shifts (
        id INTEGER PRIMARY KEY,
        opened_at TEXT NOT NULL DEFAULT (datetime('now')),
        closed_at TEXT,
        opened_by_role_id INTEGER NOT NULL REFERENCES roles(id),
        closed_by_role_id INTEGER REFERENCES roles(id),
        opening_cash REAL NOT NULL,
        closing_cash_counted REAL,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed'))
      )`,
      // Deviation vs design.md: se agrega la columna 'provider' (nullable).
      // cash-register/spec.md exige que una salida capture monto + motivo +
      // "nombre del proveedor" como datos independientes; design.md solo
      // tenia 'concept' (motivo), sin campo separado para el proveedor.
      `CREATE TABLE cash_movements (
        id INTEGER PRIMARY KEY,
        shift_id INTEGER NOT NULL REFERENCES shifts(id),
        type TEXT NOT NULL CHECK(type IN ('entrada','salida')),
        concept TEXT NOT NULL,
        provider TEXT,
        amount REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE sales (
        id INTEGER PRIMARY KEY,
        shift_id INTEGER NOT NULL REFERENCES shifts(id),
        status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed','voided')),
        subtotal REAL NOT NULL,
        total REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      // Deviation vs design.md: 'unit_cost' es NULLABLE por la misma razon
      // que products.cost -- es un snapshot (Decision 7) del costo al
      // momento de la venta, y ese costo puede no haber estado capturado.
      `CREATE TABLE sale_lines (
        id INTEGER PRIMARY KEY,
        sale_id INTEGER NOT NULL REFERENCES sales(id),
        product_id INTEGER NOT NULL REFERENCES products(id),
        department_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        unit_price REAL NOT NULL,
        unit_cost REAL,
        line_total REAL NOT NULL
      )`,
      // Deviation vs design.md: se agrega 'credito' al CHECK de 'method' y se
      // agrega la columna 'customer_id' (nullable, FK a customers).
      // sales-transactions/spec.md (Split Payment per Sale) y
      // customer-credit/spec.md requieren que una porcion de pago dividido
      // pueda ser tipo 'credito' asociada a un cliente; design.md solo
      // permitia 'efectivo'/'tarjeta' en esta tabla.
      `CREATE TABLE sale_payments (
        id INTEGER PRIMARY KEY,
        sale_id INTEGER NOT NULL REFERENCES sales(id),
        method TEXT NOT NULL CHECK(method IN ('efectivo','tarjeta','credito')),
        amount REAL NOT NULL,
        customer_id INTEGER REFERENCES customers(id)
      )`,
      `CREATE TABLE customer_credits (
        id INTEGER PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        sale_id INTEGER REFERENCES sales(id),
        shift_id INTEGER NOT NULL REFERENCES shifts(id),
        amount REAL NOT NULL,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE credit_payments (
        id INTEGER PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        shift_id INTEGER NOT NULL REFERENCES shifts(id),
        method TEXT NOT NULL DEFAULT 'efectivo' CHECK(method IN ('efectivo','tarjeta')),
        amount REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`
    ]
  },
  {
    version: 2,
    name: 'seed_roles',
    sql: seedRolesSql()
  },
  {
    version: 3,
    name: 'seed_departments',
    sql: seedDepartmentsSql()
  }
]
