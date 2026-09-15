-- Espejo de referencia (documentacion, NO se ejecuta en runtime).
-- La fuente de verdad real es el array TypeScript embebido en
-- src/main/db/migrations/index.ts (design.md Decision 5). Si este archivo
-- y ese array llegan a divergir, el array de TypeScript manda.
--
-- Este espejo incluye las 3 desviaciones respecto al esquema original de
-- design.md, documentadas tambien como comentarios en migrations/index.ts
-- y en openspec/changes/pos-inicial/apply-progress.md ("Deviations from
-- Design"):
--   1. products.cost y sale_lines.unit_cost son NULLABLE (no NOT NULL).
--   2. sale_payments.method admite 'credito' y agrega customer_id (nullable).
--   3. cash_movements agrega la columna 'provider' (nullable).

CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE CHECK(name IN ('usuario','administrador')),
  pin_salt TEXT NOT NULL,
  pin_hash TEXT NOT NULL
);

CREATE TABLE departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  department_id INTEGER NOT NULL REFERENCES departments(id),
  name TEXT NOT NULL,
  barcode TEXT UNIQUE,
  cost REAL,                          -- NULL = "sin costo capturado" (deviation #1)
  price REAL NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE shifts (               -- turno de caja
  id INTEGER PRIMARY KEY,
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  opened_by_role_id INTEGER NOT NULL REFERENCES roles(id),
  closed_by_role_id INTEGER REFERENCES roles(id),
  opening_cash REAL NOT NULL,
  closing_cash_counted REAL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed'))
);

CREATE TABLE cash_movements (       -- entradas de efectivo / salidas a proveedores
  id INTEGER PRIMARY KEY,
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  type TEXT NOT NULL CHECK(type IN ('entrada','salida')),
  concept TEXT NOT NULL,
  provider TEXT,                    -- nombre del proveedor en salidas (deviation #3)
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sales (                -- encabezado de venta
  id INTEGER PRIMARY KEY,
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed','voided')),
  subtotal REAL NOT NULL,
  total REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sale_lines (
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  department_id INTEGER NOT NULL,   -- snapshot, ver Decision 7
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,         -- snapshot
  unit_cost REAL,                   -- snapshot; NULL = costo no capturado (deviation #1)
  line_total REAL NOT NULL
);

CREATE TABLE sale_payments (        -- soporta pago dividido efectivo/tarjeta/credito
  id INTEGER PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id),
  method TEXT NOT NULL CHECK(method IN ('efectivo','tarjeta','credito')),  -- deviation #2
  amount REAL NOT NULL,
  customer_id INTEGER REFERENCES customers(id)                            -- deviation #2
);

CREATE TABLE customer_credits (     -- credito otorgado ("fiado")
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  sale_id INTEGER REFERENCES sales(id),
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  amount REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE credit_payments (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  shift_id INTEGER NOT NULL REFERENCES shifts(id),
  method TEXT NOT NULL DEFAULT 'efectivo' CHECK(method IN ('efectivo','tarjeta')),
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
