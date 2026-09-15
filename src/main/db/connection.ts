import { DatabaseSync } from 'node:sqlite'

/**
 * Abre la conexion a `node:sqlite` (design.md Decision 1) y habilita
 * `PRAGMA foreign_keys`. `enableForeignKeyConstraints: true` ya es el
 * default en Node >= 22.5 (ver docs de node:sqlite), pero se deja explicito
 * en ambos lugares (opcion del constructor + PRAGMA) porque design.md lo
 * pide literalmente y para no depender silenciosamente de un default que
 * podria cambiar entre versiones de Node.
 *
 * NO ejecuta migraciones -- esa es responsabilidad de `migrate.ts`,
 * invocada explicitamente por el proceso principal en el arranque
 * (ver src/main/index.ts) para mantener esta funcion de una sola
 * responsabilidad y facil de testear sin Electron.
 */
export function createConnection(path: string): DatabaseSync {
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true })
  db.exec('PRAGMA foreign_keys = ON')
  return db
}
