import { describe, expect, it } from 'vitest'
import { authenticate, type RoleCredential } from './authenticate'
import { hashPin } from './pin'

function credential(role: RoleCredential['role'], pin: string): RoleCredential {
  const { salt, hash } = hashPin(pin)
  return { role, pinSalt: salt, pinHash: hash }
}

describe('authenticate', () => {
  it('returns the matching role when the PIN matches the usuario credential', () => {
    const roles: RoleCredential[] = [credential('usuario', '1111'), credential('administrador', '9999')]

    expect(authenticate('1111', roles)).toBe('usuario')
  })

  it('returns the matching role when the PIN matches the administrador credential', () => {
    const roles: RoleCredential[] = [credential('usuario', '1111'), credential('administrador', '9999')]

    expect(authenticate('9999', roles)).toBe('administrador')
  })

  it('returns null when the PIN matches none of the role credentials', () => {
    const roles: RoleCredential[] = [credential('usuario', '1111'), credential('administrador', '9999')]

    expect(authenticate('0000', roles)).toBeNull()
  })
})
