import { useState } from 'react'
import { api } from '../ipc-client'
import type { Role } from '../../shared/ipc-types'

interface LoginProps {
  onLogin: (role: Role) => void
}

const KEYPAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']

/**
 * Pantalla de login con teclado numerico (tasks.md 3.7). Sin persistencia:
 * el PIN capturado solo vive en el estado de este componente hasta que se
 * confirma o se borra.
 */
function Login({ onLogin }: LoginProps): React.JSX.Element {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  function pressDigit(digit: string): void {
    setError(null)
    setPin((current) => current + digit)
  }

  function backspace(): void {
    setError(null)
    setPin((current) => current.slice(0, -1))
  }

  async function confirm(): Promise<void> {
    const result = await api.auth.login(pin)
    if (result.ok && result.role) {
      setPin('')
      onLogin(result.role)
      return
    }

    setError('PIN incorrecto')
    setPin('')
  }

  return (
    <main>
      <h1>Bahia de los Angeles - Iniciar sesion</h1>
      <p aria-label="pin-display">{'*'.repeat(pin.length) || 'Ingresa tu PIN'}</p>
      {error && <p role="alert">{error}</p>}
      <div>
        {KEYPAD_DIGITS.map((digit) => (
          <button key={digit} type="button" onClick={() => pressDigit(digit)}>
            {digit}
          </button>
        ))}
        <button type="button" onClick={backspace}>
          Borrar
        </button>
        <button type="button" onClick={confirm} disabled={pin.length === 0}>
          Confirmar
        </button>
      </div>
    </main>
  )
}

export default Login
