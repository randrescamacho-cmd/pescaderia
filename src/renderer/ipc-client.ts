// Wrapper tipado sobre `window.api` (design.md "Estructura de Carpetas").
// Las pantallas importan de aqui en vez de tocar `window.api` directamente,
// para tener un unico punto de cambio si el contrato IPC evoluciona.
import type { PosApi } from '../shared/ipc-types'

export const api: PosApi = window.api
