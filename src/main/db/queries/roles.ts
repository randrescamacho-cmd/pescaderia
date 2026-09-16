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

/**
 * Mapea el rol de sesion (string 'usuario'/'administrador') a `roles.id`
 * (INTEGER) para las FK `shifts.opened_by_role_id`/`closed_by_role_id`
 * (design.md esquema). Documentado como pendiente en apply-progress.md
 * "Pendiente para PR3" -- no existia todavia ninguna consulta que hiciera
 * este mapeo.
 */
export function getRoleId(db: DatabaseSync, role: Role): number {
  const row = db.prepare('SELECT id FROM roles WHERE name = ?').get(role) as { id: number } | undefined

  if (!row) {
    throw new Error(`Rol desconocido: ${role}`)
  }

  return row.id
}
