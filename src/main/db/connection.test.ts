import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createConnection } from './connection'

describe('createConnection', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pescaderia-pos-db-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('opens a real file-backed SQLite database that can execute statements', () => {
    const dbPath = join(dir, 'test.sqlite')
    const db = createConnection(dbPath)

    expect(() => db.exec('CREATE TABLE ping (id INTEGER PRIMARY KEY)')).not.toThrow()

    db.close()
  })

  it('enables foreign_keys enforcement (PRAGMA foreign_keys reads back as 1)', () => {
    const dbPath = join(dir, 'fk.sqlite')
    const db = createConnection(dbPath)

    const pragma = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }
    expect(pragma.foreign_keys).toBe(1)

    db.close()
  })
})
