import type { DatabaseSync } from 'node:sqlite'
import type { RoleCredential } from '../../auth/authenticate'
import type { Role } from '../../auth/session'

interface RoleRow {
  name: Role
  pin_salt: string
  pin_hash: string
}

/**
 * Lee las credenciales de los 2 roles sembrados (migracion `2:seed_roles`)
 * para que `ipc/auth.ts` pueda delegar la comparacion de PIN a
 * `auth/authenticate.ts` (funcion pura, sin acceso a BD).
 */
export function getRoleCredentials(db: DatabaseSync): RoleCredential[] {
  const rows = db.prepare('SELECT name, pin_salt, pin_hash FROM roles').all() as unknown as RoleRow[]

  return rows.map((row) => ({
    role: row.name,
    pinSalt: row.pin_salt,
    pinHash: row.pin_hash
  }))
}

/**
 * Sobrescribe pin_salt/pin_hash de un rol (auth-roles spec "PIN Change
 * Restricted to Administrator"). El guard de rol vive en el handler IPC
 * (`ipc/auth.ts`), no aqui -- esta funcion asume que el caller ya valido
 * permisos.
 */
export function updateRolePin(db: DatabaseSync, role: Role, pinSalt: string, pinHash: string): void {
  db.prepare('UPDATE roles SET pin_salt = ?, pin_hash = ? WHERE name = ?').run(pinSalt, pinHash, role)
}
