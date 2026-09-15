/**
 * Task 1.5 (design.md Open Questions / decision 1): `node:sqlite` requirio
 * el flag `--experimental-sqlite` hasta Node 22.13.0 en la linea 22.x y
 * hasta Node 23.4.0 en la linea 23.x (ver
 * https://nodejs.org/api/sqlite.html, changelog de `node:sqlite`). Desde
 * esas versiones el modulo funciona sin el flag (aunque siga marcado
 * experimental/release-candidate). A partir de Node 24 nunca lo requirio.
 *
 * Electron 44.3.0 (version elegida, ver apply-progress.md) empaqueta
 * Node 24.20.0 -- por lo tanto esta funcion devuelve `false` para el build
 * real, pero se deja como guardia defensiva evaluada en tiempo de arranque
 * (ver src/main/index.ts) por si la version de Electron/Node bundle cambia
 * en el futuro.
 */
export function needsExperimentalSqliteFlag(nodeVersion: string): boolean {
  const [major, minor] = nodeVersion
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10))

  if (major >= 24) return false
  if (major === 23) return minor < 4
  if (major === 22) return minor < 13
  // Versiones de Node menores a 22 no tienen node:sqlite en absoluto; el
  // flag no ayudaria, pero tampoco hace dano intentarlo (no-op).
  return true
}
