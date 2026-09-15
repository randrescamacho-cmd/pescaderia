import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

/**
 * Hash/verify de PIN (design.md Decision 4: `scryptSync` + `timingSafeEqual`,
 * sin libreria externa, para no reintroducir el riesgo de compilacion nativa
 * que se descarto al elegir `node:sqlite`). Este es el modulo reutilizable
 * que `migrations/index.ts` (PR1) documento como pendiente -- ver
 * apply-progress.md "Pendiente para PR2".
 */
export interface PinHash {
  salt: string
  hash: string
}

export function hashPin(pin: string): PinHash {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(pin, salt, 64).toString('hex')
  return { salt, hash }
}

export function verifyPin(pin: string, salt: string, hash: string): boolean {
  const candidate = scryptSync(pin, salt, 64)
  const expected = Buffer.from(hash, 'hex')

  if (candidate.length !== expected.length) {
    return false
  }

  return timingSafeEqual(candidate, expected)
}
