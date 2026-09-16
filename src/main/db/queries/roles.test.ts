import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { runMigrations } from '../migrate'
import { getRoleCredentials, getRoleId, updateRolePin } from './roles'

function openMigratedDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:', { enableForeignKeyConstraints: true })
  runMigrations(db)
  return db
}

describe('getRoleCredentials', () => {
  it('returns exactly the 2 seeded roles with their pin_salt/pin_hash', () => {
    const db = openMigratedDb()

    const roles = getRoleCredentials(db)

    expect(roles.map((r) => r.role).sort()).toEqual(['administrador', 'usuario'])
    for (const role of roles) {
      expect(role.pinSalt).toBeTruthy()
      expect(role.pinHash).toBeTruthy()
    }
  })
})

describe('updateRolePin', () => {
  it('overwrites the pin_salt/pin_hash for the given role only', () => {
    const db = openMigratedDb()

    updateRolePin(db, 'usuario', 'nueva-salt', 'nueva-hash')

    const roles = getRoleCredentials(db)
    const usuario = roles.find((r) => r.role === 'usuario')!
    const administrador = roles.find((r) => r.role === 'administrador')!

    expect(usuario.pinSalt).toBe('nueva-salt')
    expect(usuario.pinHash).toBe('nueva-hash')
    expect(administrador.pinSalt).not.toBe('nueva-salt')
  })
})

describe('getRoleId', () => {
  it('resolves the integer roles.id for "usuario" (needed for shifts.opened_by_role_id FK)', () => {
    const db = openMigratedDb()

    const id = getRoleId(db, 'usuario')

    expect(typeof id).toBe('number')
    expect(Number.isInteger(id)).toBe(true)
  })

  it('resolves a different id for "administrador" than for "usuario"', () => {
    const db = openMigratedDb()

    const usuarioId = getRoleId(db, 'usuario')
    const administradorId = getRoleId(db, 'administrador')

    expect(administradorId).not.toBe(usuarioId)
  })

  it('throws for a role name that does not exist', () => {
    const db = openMigratedDb()

    expect(() => getRoleId(db, 'inexistente' as never)).toThrow()
  })
})
