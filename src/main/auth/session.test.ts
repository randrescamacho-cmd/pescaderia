import { describe, expect, it } from 'vitest'
import { assertAuthenticated, assertRole, createSessionStore } from './session'

describe('createSessionStore', () => {
  it('has no active role until login is called', () => {
    const session = createSessionStore()

    expect(session.getRole()).toBeNull()
  })

  it('returns the role that was just logged in', () => {
    const session = createSessionStore()

    session.login('administrador')

    expect(session.getRole()).toBe('administrador')
  })

  it('clears the role after logout', () => {
    const session = createSessionStore()
    session.login('usuario')

    session.logout()

    expect(session.getRole()).toBeNull()
  })
})

describe('assertRole', () => {
  it('does not throw when the current role matches the required role', () => {
    expect(() => assertRole('administrador', 'administrador')).not.toThrow()
  })

  it('throws when the current role is usuario but administrador is required', () => {
    expect(() => assertRole('usuario', 'administrador')).toThrow()
  })

  it('throws when there is no active session (null role)', () => {
    expect(() => assertRole(null, 'administrador')).toThrow()
  })
})

describe('assertAuthenticated', () => {
  it('does not throw when the role is usuario (tasks.md 5: any authenticated role can sell)', () => {
    expect(() => assertAuthenticated('usuario')).not.toThrow()
  })

  it('does not throw when the role is administrador', () => {
    expect(() => assertAuthenticated('administrador')).not.toThrow()
  })

  it('throws when there is no active session (null role)', () => {
    expect(() => assertAuthenticated(null)).toThrow()
  })
})
