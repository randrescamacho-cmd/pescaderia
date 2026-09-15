import { describe, expect, it } from 'vitest'
import { hashPin, verifyPin } from './pin'

describe('hashPin / verifyPin', () => {
  it('verifies successfully when the correct PIN is checked against its own hash', () => {
    const { salt, hash } = hashPin('1111')

    expect(verifyPin('1111', salt, hash)).toBe(true)
  })

  it('rejects an incorrect PIN checked against a hash produced by a different PIN', () => {
    const { salt, hash } = hashPin('9999')

    expect(verifyPin('1111', salt, hash)).toBe(false)
  })

  it('produces a different salt and hash each time, even for the same PIN', () => {
    const first = hashPin('1111')
    const second = hashPin('1111')

    expect(first.salt).not.toBe(second.salt)
    expect(first.hash).not.toBe(second.hash)
    // Ambos deben seguir siendo validos para el PIN que los genero.
    expect(verifyPin('1111', first.salt, first.hash)).toBe(true)
    expect(verifyPin('1111', second.salt, second.hash)).toBe(true)
  })
})
