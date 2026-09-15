/**
 * Sesion (rol activo) del proceso principal.
 *
 * Deviation vs. lectura literal de design.md ("la sesion vive solo en
 * memoria del renderer"): la sesion autoritativa MUST vivir en el main
 * process para que el "Role guard middleware" (tasks.md 4.4) pueda rechazar
 * llamadas IPC Admin-only de forma real. Si el renderer fuera la unica
 * fuente de verdad, cualquier llamada `invoke` directa (sin pasar por la UI)
 * podria enviar el rol que quisiera y el guard no protegeria nada. La
 * restriccion de fondo de design.md ("no se persiste en disco", "cerrar la
 * app exige re-ingresar PIN") se preserva igual: este store es un objeto en
 * memoria del proceso, se crea una sola vez en `src/main/index.ts` y se
 * pierde por completo al cerrar la app -- nunca toca disco. El renderer
 * tambien mantiene su propia copia en memoria (React state) solo para UI
 * (mostrar/ocultar pantallas), pero la fuente de verdad para el guard es
 * esta.
 */
import type { Role } from '../../shared/ipc-types'

export type { Role }

export interface SessionStore {
  getRole(): Role | null
  login(role: Role): void
  logout(): void
}

export function createSessionStore(): SessionStore {
  let currentRole: Role | null = null

  return {
    getRole: () => currentRole,
    login: (role: Role) => {
      currentRole = role
    },
    logout: () => {
      currentRole = null
    }
  }
}

/**
 * Guard de rol (tasks.md 4.4 / auth-roles spec "Administrator-Only
 * Actions"). Funcion pura: recibe el rol actual (ya resuelto por el
 * SessionStore) y el rol requerido: no depende de Electron ni de IPC, lo que
 * la hace trivial de testear.
 */
export function assertRole(currentRole: Role | null, requiredRole: Role): void {
  if (currentRole !== requiredRole) {
    throw new Error(`Accion restringida al rol '${requiredRole}'`)
  }
}
