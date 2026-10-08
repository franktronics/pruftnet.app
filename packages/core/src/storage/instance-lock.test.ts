import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { Effect, Layer } from 'effect'
import { afterEach, describe, expect, test } from 'vitest'

import { AppDataPaths, InstanceLock, instanceLockPathFor } from './index'

const roots: Array<string> = []

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

async function testRoot() {
    const root = await mkdtemp(join(tmpdir(), 'pruftnet-lock-'))
    roots.push(root)
    return root
}

function previousShutdown(root: string) {
    const paths = AppDataPaths.layer({ runtime: 'test', environment: 'test', dataRoot: root })
    return Effect.runPromise(
        InstanceLock.pipe(
            Effect.map((lock) => lock.previousShutdown),
            Effect.scoped,
            Effect.provide(InstanceLock.layer.pipe(Layer.provide(paths))),
        ),
    )
}

describe('InstanceLock', () => {
    test('reports a clean shutdown after the previous instance released the lock', async () => {
        const root = await testRoot()

        await expect(previousShutdown(root)).resolves.toBe('clean')
        await expect(previousShutdown(root)).resolves.toBe('clean')
    })

    test('reports an unclean shutdown when reclaiming a lock left by a dead process', async () => {
        const root = await testRoot()
        const { pid } = spawnSync(process.execPath, ['-e', ''])
        const lockPath = instanceLockPathFor(root)
        await mkdir(dirname(lockPath), { recursive: true })
        await writeFile(lockPath, JSON.stringify({ pid, startedAtMs: Date.now() }))

        await expect(previousShutdown(root)).resolves.toBe('unclean')
        await expect(previousShutdown(root)).resolves.toBe('clean')
    })
})
