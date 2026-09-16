import { useState } from 'react'
import { api } from './ipc-client'
import Caja from './screens/Caja'
import CorteDelDia from './screens/CorteDelDia'
import Creditos from './screens/Creditos'
import Departamentos from './screens/Departamentos'
import Login from './screens/Login'
import Productos from './screens/Productos'
import Ventas from './screens/Ventas'
import type { Role } from '../shared/ipc-types'

type Screen = 'home' | 'departamentos' | 'productos' | 'ventas' | 'caja' | 'creditos' | 'corte'

/**
 * Estado de sesion del renderer (design.md: "vive en memoria del renderer,
 * no se persiste"). Es una COPIA para efectos de UI (mostrar/ocultar
 * pantallas de Admin) -- la fuente de verdad que realmente bloquea acciones
 * es el guard en el main process (`src/main/auth/session.ts`, ver la nota de
 * deviation ahi). Sin router: solo 3 pantallas en este PR (login,
 * departamentos, productos); Ventas/Caja/Creditos/Corte llegan en PRs
 * posteriores (tasks.md Fases 5-9).
 */
function App(): React.JSX.Element {
  const [role, setRole] = useState<Role | null>(null)
  const [screen, setScreen] = useState<Screen>('home')

  async function handleLogout(): Promise<void> {
    await api.auth.logout()
    setRole(null)
    setScreen('home')
  }

  if (!role) {
    return <Login onLogin={setRole} />
  }

  return (
    <main>
      <header>
        <h1>Pescaderia POS - Bahia de los Angeles</h1>
        <p>
          Sesion activa: <strong>{role}</strong>
        </p>
        <nav>
          <button type="button" onClick={() => setScreen('home')}>
            Inicio
          </button>
          <button type="button" onClick={() => setScreen('ventas')}>
            Ventas
          </button>
          <button type="button" onClick={() => setScreen('caja')}>
            Caja
          </button>
          <button type="button" onClick={() => setScreen('creditos')}>
            Creditos
          </button>
          <button type="button" onClick={() => setScreen('corte')}>
            Corte del Dia
          </button>
          {role === 'administrador' && (
            <>
              <button type="button" onClick={() => setScreen('departamentos')}>
                Departamentos
              </button>
              <button type="button" onClick={() => setScreen('productos')}>
                Productos
              </button>
            </>
          )}
          <button type="button" onClick={handleLogout}>
            Cerrar sesion
          </button>
        </nav>
      </header>

      {screen === 'home' && (
        <p>
          Fase 3 (Autenticacion), Fase 4 (Catalogo), Fase 5 (Ventas) y Fase 6 (Caja) completadas.
          Creditos, corte del dia e impresion llegan en el siguiente PR.
        </p>
      )}
      {screen === 'ventas' && <Ventas />}
      {screen === 'caja' && <Caja />}
      {screen === 'creditos' && <Creditos />}
      {screen === 'corte' && <CorteDelDia />}
      {screen === 'departamentos' && role === 'administrador' && <Departamentos />}
      {screen === 'productos' && role === 'administrador' && <Productos />}
    </main>
  )
}

export default App
