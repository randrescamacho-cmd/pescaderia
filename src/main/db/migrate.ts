import type { DatabaseSync } from 'node:sqlite'
import { migrations } from './migrations'

const ENSURE_SCHEMA_MIGRATIONS_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`

export interface MigrationResult {
  applied: number[]
}

function getAppliedVersions(db: DatabaseSync): Set<number> {
  const rows = db.prepare('SELECT version FROM schema_migrations').all() as {
    version: number
  }[]
  return new Set(rows.map((row) => row.version))
}

/**
 * Crea `schema_migrations` si no existe y aplica, en orden y dentro de una
 * transaccion por version, todas las migraciones pendientes (version >
 * MAX(schema_migrations.version) aplicado). Ver design.md "Migraciones de
 * Esquema".
 */
export function runMigrations(db: DatabaseSync): MigrationResult {
  db.exec(ENSURE_SCHEMA_MIGRATIONS_TABLE)

  const applied = getAppliedVersions(db)
  const pending = migrations
    .filter((migration) => !applied.has(migration.version))
    .sort((a, b) => a.version - b.version)

  const appliedNow: number[] = []

  for (const migration of pending) {
    db.exec('BEGIN')
    try {
      for (const statement of migration.sql) {
        db.exec(statement)
      }
      const insertVersion = db.prepare(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)'
      )
      insertVersion.run(migration.version, migration.name)
      db.exec('COMMIT')
      appliedNow.push(migration.version)
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  return { applied: appliedNow }
}
