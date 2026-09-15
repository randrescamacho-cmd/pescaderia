import type { Role } from './session'
import { verifyPin } from './pin'

/**
 * Fila de credenciales de un rol, tal como viven en la tabla `roles`
 * (design.md: PIN compartido por rol, no cuentas individuales).
 */
export interface RoleCredential {
  role: Role
  pinSalt: string
  pinHash: string
}

/**
 * Compara el PIN capturado contra las credenciales de ambos roles
 * (auth-roles/spec.md "Two Shared-PIN Roles"). Funcion pura: no toca la BD ni
 * el estado de sesion -- eso es responsabilidad de `ipc/auth.ts`.
 */
export function authenticate(pin: string, roles: RoleCredential[]): Role | null {
  for (const credential of roles) {
    if (verifyPin(pin, credential.pinSalt, credential.pinHash)) {
      return credential.role
    }
  }
  return null
}
