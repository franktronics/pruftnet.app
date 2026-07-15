import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Cause, Effect, Exit } from 'effect'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { AppDataPaths, AppDataPathError } from './index'

const roots: Array<string> = []

afterEach(async () => {
    vi.unstubAllEnvs()
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

describe('AppDataPaths', () => {
    test('creates the durable layout under an explicit test root', async () => {
        const root = await mkdtemp(join(tmpdir(), 'pruftnet-paths-'))
        roots.push(root)
        const paths = await Effect.runPromise(
            AppDataPaths.pipe(
                Effect.provide(
                    AppDataPaths.layer({
                        runtime: 'test',
                        environment: 'test',
                        dataRoot: root,
                    }),
                ),
            ),
        )

        const canonicalRoot = await realpath(root)
        expect(paths.dataRoot).toBe(canonicalRoot)
        expect(paths.databasePath).toBe(join(canonicalRoot, 'pruftnet.sqlite'))
        expect(paths.captureSegmentsRoot('a'.repeat(32))).toBe(
            join(canonicalRoot, 'captures', 'a'.repeat(32), 'segments'),
        )
        expect(paths.exportRoot('export-1')).toBe(join(canonicalRoot, 'exports', 'export-1'))
        expect(() => paths.resolveContained(join(canonicalRoot, '..', 'escape'))).toThrow(
            AppDataPathError,
        )
    })

    test('requires tests to provide a unique root', async () => {
        const exit = await Effect.runPromiseExit(
            AppDataPaths.pipe(
                Effect.provide(AppDataPaths.layer({ runtime: 'test', environment: 'test' })),
            ),
        )
        expect(Exit.isFailure(exit)).toBe(true)
        if (Exit.isFailure(exit)) expect(Cause.pretty(exit.cause)).toContain('AppDataPathError')
    })

    test('shares the development root between desktop and server', async () => {
        const workspace = await mkdtemp(join(tmpdir(), 'pruftnet-workspace-'))
        roots.push(workspace)
        const desktop = await Effect.runPromise(
            AppDataPaths.pipe(
                Effect.provide(
                    AppDataPaths.layer({
                        runtime: 'desktop',
                        environment: 'development',
                        workspaceRoot: workspace,
                    }),
                ),
            ),
        )
        const server = await Effect.runPromise(
            AppDataPaths.pipe(
                Effect.provide(
                    AppDataPaths.layer({
                        runtime: 'server',
                        environment: 'development',
                        workspaceRoot: workspace,
                    }),
                ),
            ),
        )

        const sharedRoot = await realpath(join(workspace, '.data', 'pruftnet'))
        expect(desktop.dataRoot).toBe(sharedRoot)
        expect(server.dataRoot).toBe(sharedRoot)
    })

    test('honors the shared data directory override for desktop and server', async () => {
        const root = await mkdtemp(join(tmpdir(), 'pruftnet-shared-root-'))
        roots.push(root)
        vi.stubEnv('PRUFTNET_DATA_DIR', root)

        const resolvePaths = (runtime: 'desktop' | 'server') =>
            Effect.runPromise(
                AppDataPaths.pipe(
                    Effect.provide(
                        AppDataPaths.layer({
                            runtime,
                            environment: 'production',
                        }),
                    ),
                ),
            )

        const [desktop, server] = await Promise.all([
            resolvePaths('desktop'),
            resolvePaths('server'),
        ])
        const sharedRoot = await realpath(root)
        expect(desktop.dataRoot).toBe(sharedRoot)
        expect(server.dataRoot).toBe(sharedRoot)
    })

    test('rejects a segment path belonging to another capture', async () => {
        const root = await mkdtemp(join(tmpdir(), 'pruftnet-paths-'))
        roots.push(root)
        const paths = await Effect.runPromise(
            AppDataPaths.pipe(
                Effect.provide(
                    AppDataPaths.layer({
                        runtime: 'test',
                        environment: 'test',
                        dataRoot: root,
                    }),
                ),
            ),
        )
        const left = 'a'.repeat(32)
        const right = 'b'.repeat(32)

        expect(() =>
            paths.resolveCaptureSegmentPath(
                left,
                join(paths.captureSegmentsRoot(right), 'x.pcapng'),
            ),
        ).toThrow(AppDataPathError)
    })
})
