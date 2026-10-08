import { open, readFile, unlink, type FileHandle } from 'node:fs/promises'

import { Clock, Context, Effect, Layer } from 'effect'

import { AppDataPaths } from './app-data-paths'
import { InstanceLockError } from './errors'

export interface LockOwner {
    readonly pid: number
    readonly startedAtMs: number
}

/**
 * `unclean` when a lock left by a dead process was reclaimed: the previous instance did not
 * release its resources, so durable state may need verification.
 */
export type PreviousShutdown = 'clean' | 'unclean'

function isErrno(value: unknown, code: string): value is NodeJS.ErrnoException {
    return value instanceof Error && 'code' in value && value.code === code
}

function parseOwner(value: string): LockOwner | undefined {
    try {
        const parsed = JSON.parse(value) as Partial<LockOwner>
        return Number.isSafeInteger(parsed.pid) && Number.isSafeInteger(parsed.startedAtMs)
            ? { pid: parsed.pid!, startedAtMs: parsed.startedAtMs! }
            : undefined
    } catch {
        return undefined
    }
}

function processIsAlive(pid: number) {
    try {
        process.kill(pid, 0)
        return true
    } catch (cause) {
        return isErrno(cause, 'EPERM')
    }
}

/**
 * Process holding an instance lock, if it is still alive. Lets diagnostics report a running
 * instance without acquiring the lock.
 */
export async function readLiveInstanceLockOwner(path: string): Promise<LockOwner | undefined> {
    const owner = await readFile(path, 'utf8')
        .then(parseOwner)
        .catch(() => undefined)
    return owner && processIsAlive(owner.pid) ? owner : undefined
}

async function acquire(
    path: string,
    startedAtMs: number,
): Promise<{ handle: FileHandle; previousShutdown: PreviousShutdown }> {
    let previousShutdown: PreviousShutdown = 'clean'
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const handle = await open(path, 'wx', 0o600)
            await handle.writeFile(
                JSON.stringify({ pid: process.pid, startedAtMs } satisfies LockOwner),
            )
            await handle.sync()
            return { handle, previousShutdown }
        } catch (cause) {
            if (!isErrno(cause, 'EEXIST')) throw cause
            const owner = await readFile(path, 'utf8')
                .then(parseOwner)
                .catch(() => undefined)
            if (owner && processIsAlive(owner.pid)) {
                throw new InstanceLockError({
                    message: `Application data is already in use by process ${owner.pid}.`,
                    lockPath: path,
                    ownerPid: owner.pid,
                })
            }
            await unlink(path).catch((removeCause) => {
                if (!isErrno(removeCause, 'ENOENT')) throw removeCause
            })
            previousShutdown = 'unclean'
        }
    }
    throw new InstanceLockError({
        message: 'Unable to acquire the application data instance lock.',
        lockPath: path,
    })
}

export class InstanceLock extends Context.Tag('@repo/core/storage/InstanceLock')<
    InstanceLock,
    { readonly path: string; readonly previousShutdown: PreviousShutdown }
>() {
    static readonly layer = Layer.scoped(
        InstanceLock,
        Effect.gen(function* () {
            const paths = yield* AppDataPaths
            const startedAtMs = yield* Clock.currentTimeMillis
            const { previousShutdown } = yield* Effect.acquireRelease(
                Effect.tryPromise({
                    try: () => acquire(paths.instanceLockPath, startedAtMs),
                    catch: (cause) =>
                        cause instanceof InstanceLockError
                            ? cause
                            : new InstanceLockError({
                                  message: 'Unable to acquire the application data instance lock.',
                                  lockPath: paths.instanceLockPath,
                                  cause,
                              }),
                }),
                ({ handle }) =>
                    Effect.promise(async () => {
                        await handle.close().catch(() => undefined)
                        await unlink(paths.instanceLockPath).catch(() => undefined)
                    }),
            )
            return InstanceLock.of({ path: paths.instanceLockPath, previousShutdown })
        }),
    )
}
