import { DatabaseSync } from 'node:sqlite'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import { checkDatabaseIntegrity } from './integrity-check'

const roots: Array<string> = []

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function testRoot() {
    const root = await mkdtemp(join(tmpdir(), 'pruftnet-integrity-'))
    roots.push(root)
    return root
}

describe('checkDatabaseIntegrity', () => {
    test('accepts a valid database', async () => {
        const path = join(await testRoot(), 'valid.sqlite')
        const database = new DatabaseSync(path)
        database.exec(
            'CREATE TABLE sample (id INTEGER PRIMARY KEY); INSERT INTO sample DEFAULT VALUES',
        )
        database.close()

        await expect(checkDatabaseIntegrity(path)).resolves.toBeUndefined()
    })

    test('rejects a file that is not a valid database', async () => {
        const path = join(await testRoot(), 'invalid.sqlite')
        await writeFile(path, 'not a sqlite database'.repeat(256))

        await expect(checkDatabaseIntegrity(path)).rejects.toThrow()
    })
})
