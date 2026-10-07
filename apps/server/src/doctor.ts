import { constants } from 'node:fs'
import { access, stat } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'

import {
    instanceLockPathFor,
    readLiveInstanceLockOwner,
    releaseCommand,
    releaseName,
    releaseVersion,
    resolveCaptureWorkerPath,
} from '@repo/core'
import type { CaptureInterface } from '@repo/shared/capture'
import { Effect, Either } from 'effect'

import { describeError, withCaptureWorker } from '#server/capture-probe'
import type { CliError } from '#server/errors'
import type { RuntimePaths } from '#server/runtime-paths'
import { formatServerUrl, type HealthResponse } from '#server/server'
import type { ServerSettings } from '#server/settings/settings'

export type CheckStatus = 'ok' | 'warning' | 'error'

export interface DoctorCheck {
    readonly name: string
    readonly status: CheckStatus
    readonly detail: string
    readonly hint?: string
}

const check = (name: string, status: CheckStatus, detail: string, hint?: string): DoctorCheck =>
    hint === undefined ? { name, status, detail } : { name, status, detail, hint }

function errnoCode(cause: unknown) {
    return cause instanceof Error && 'code' in cause ? String(cause.code) : undefined
}

const canAccess = (path: string, mode: number) =>
    Effect.promise(() =>
        access(path, mode).then(
            () => true,
            () => false,
        ),
    )

const nearestExistingDirectory = (path: string) =>
    Effect.promise(async () => {
        let current = path
        while (true) {
            const info = await stat(current).catch(() => undefined)
            if (info) return info.isDirectory() ? current : undefined
            const parent = dirname(current)
            if (parent === current) return undefined
            current = parent
        }
    })

export const checkDataDirectory = Effect.fn('checkDataDirectory')(function* (dataDir: string) {
    const name = 'Data directory'
    const info = yield* Effect.promise(() => stat(dataDir).catch(() => undefined))
    if (info && !info.isDirectory()) {
        return check(name, 'error', `${dataDir} is not a directory`, 'Pass another --data-dir.')
    }
    if (!info) {
        const parent = yield* nearestExistingDirectory(dataDir)
        if (parent && (yield* canAccess(parent, constants.W_OK))) {
            return check(name, 'ok', `${dataDir} (created on first start)`)
        }
        return check(
            name,
            'error',
            `${dataDir} does not exist and cannot be created`,
            'Create it with write access for this user, or pass another --data-dir.',
        )
    }
    if (!(yield* canAccess(dataDir, constants.R_OK | constants.W_OK))) {
        return check(
            name,
            'error',
            `${dataDir} is not writable by this user`,
            'Fix its ownership, or pass another --data-dir.',
        )
    }
    const owner = yield* Effect.promise(() =>
        readLiveInstanceLockOwner(instanceLockPathFor(dataDir)),
    )
    return check(
        name,
        'ok',
        owner ? `${dataDir} (in use by running process ${owner.pid})` : dataDir,
    )
})

const tryBind = (host: string, port: number) =>
    Effect.async<void, NodeJS.ErrnoException>((resume) => {
        const server = createServer()
        server.once('error', (error) => resume(Effect.fail(error)))
        server.listen(port, host, () => server.close(() => resume(Effect.void)))
    })

const readPruftnetHealth = (url: string) =>
    Effect.tryPromise(async () => {
        const response = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1_000) })
        const body = (await response.json()) as Partial<HealthResponse>
        return body.status === 'ok' && typeof body.name === 'string' ? body : undefined
    }).pipe(Effect.orElseSucceed(() => undefined))

export const checkPort = Effect.fn('checkPort')(function* (settings: ServerSettings) {
    const name = 'Port'
    const host = settings.host.value
    const port = settings.port.value
    const url = formatServerUrl(host, port)
    const bound = yield* Effect.either(tryBind(host, port))
    if (Either.isRight(bound)) return check(name, 'ok', `${url} is available`)
    if (errnoCode(bound.left) === 'EACCES') {
        return check(
            name,
            'error',
            `${url} requires elevated privileges`,
            'Choose a port above 1023.',
        )
    }
    if (errnoCode(bound.left) !== 'EADDRINUSE') {
        return check(name, 'error', `${url} cannot be bound: ${bound.left.message}`)
    }
    const health = yield* readPruftnetHealth(url)
    if (health) {
        return check(name, 'warning', `${url} is served by ${health.name} ${health.version}`)
    }
    return settings.strictPort.value
        ? check(name, 'error', `${url} is used by another program`, 'Choose another --port.')
        : check(
              name,
              'warning',
              `${url} is used by another program; serve will try the next ports`,
              'Choose another --port to keep a stable address.',
          )
})

const checkFile = (name: string, path: string, hint: string) =>
    canAccess(path, constants.R_OK).pipe(
        Effect.map((readable) =>
            readable ? check(name, 'ok', path) : check(name, 'error', `${path} is missing`, hint),
        ),
    )

function workerPermissionHint(workerPath: string) {
    switch (process.platform) {
        case 'linux':
            return `Debian packages grant capture to members of the "pruftnet" group: sudo usermod -aG pruftnet "$USER", then log in again. Other installations: sudo setcap cap_net_raw,cap_net_admin=eip ${workerPath}`
        case 'darwin':
            return 'Install Wireshark ChmodBPF, or run: sudo chown "$USER" /dev/bpf*'
        case 'win32':
            return 'Reinstall Npcap without "Restrict Npcap driver\'s access to Administrators only".'
        default:
            return undefined
    }
}

const resolveWorkerPath = (paths: RuntimePaths) =>
    Effect.try(() => paths.captureWorkerPath ?? resolveCaptureWorkerPath(process.cwd()))

const checkWorkerExecutable = Effect.fn('checkWorkerExecutable')(function* (paths: RuntimePaths) {
    const name = 'Capture worker'
    const resolved = yield* Effect.either(resolveWorkerPath(paths))
    if (Either.isLeft(resolved)) {
        return {
            check: check(
                name,
                'error',
                'The native worker was not found',
                'Reinstall the server. In a source checkout, run pnpm build:cpp.',
            ),
        }
    }
    const workerPath = resolved.right
    if (!(yield* canAccess(workerPath, constants.F_OK))) {
        return {
            check: check(name, 'error', `${workerPath} is missing`, 'Reinstall the server.'),
        }
    }
    const mode = process.platform === 'win32' ? constants.F_OK : constants.X_OK
    if (!(yield* canAccess(workerPath, mode))) {
        return {
            check: check(
                name,
                'error',
                `${workerPath} is not executable by this user`,
                workerPermissionHint(workerPath),
            ),
        }
    }
    return { check: check(name, 'ok', workerPath), workerPath }
})

function permissionCandidate(interfaces: ReadonlyArray<CaptureInterface>) {
    return (
        interfaces.find(
            (item) => item.isUp && item.isRunning && !item.isLoopback && item.addresses.length > 0,
        ) ??
        interfaces.find((item) => item.isUp && item.isRunning && !item.isLoopback) ??
        interfaces.find((item) => item.isUp && !item.isLoopback) ??
        interfaces[0]
    )
}

function errorMessage(error: unknown) {
    if (typeof error === 'object' && error !== null && 'message' in error) {
        const { message } = error as { message: unknown }
        if (typeof message === 'string' && message !== '') return message
    }
    return describeError(error)
}

const checkCapture = Effect.fn('checkCapture')(function* (paths: RuntimePaths, workerPath: string) {
    const probe = yield* Effect.either(
        withCaptureWorker(paths, (capture) =>
            Effect.gen(function* () {
                const interfaces = yield* capture.listInterfaces()
                const candidate = permissionCandidate(interfaces)
                const permission = candidate
                    ? yield* Effect.either(capture.capabilities(candidate.name, false))
                    : undefined
                return { interfaces, candidate, permission }
            }),
        ),
    )
    if (Either.isLeft(probe)) {
        return [
            check(
                'Worker startup',
                'error',
                describeError(probe.left),
                process.platform === 'win32'
                    ? 'Install Npcap from https://npcap.com/ and try again.'
                    : undefined,
            ),
        ]
    }
    const { interfaces, candidate, permission } = probe.right
    const checks = [
        check('Worker startup', 'ok', 'The native worker started and answered'),
        interfaces.length > 0
            ? check('Interfaces', 'ok', `${interfaces.length} capture interfaces found`)
            : check(
                  'Interfaces',
                  'warning',
                  'No capture interfaces found',
                  workerPermissionHint(workerPath),
              ),
    ]
    if (!candidate || !permission) return checks
    return [
        ...checks,
        Either.isRight(permission)
            ? check('Capture permission', 'ok', `Opened ${candidate.name} for capture`)
            : check(
                  'Capture permission',
                  'error',
                  `Cannot open ${candidate.name}: ${errorMessage(permission.left)}`,
                  workerPermissionHint(workerPath),
              ),
    ]
})

export interface DoctorInput {
    readonly paths: RuntimePaths
    readonly settings: Either.Either<ServerSettings, CliError>
}

/** Checks everything `serve` and live capture depend on, without starting the server. */
export const runDoctor = Effect.fn('runDoctor')(function* (input: DoctorInput) {
    const { paths } = input
    const checks: DoctorCheck[] = [
        check(
            'Version',
            'ok',
            `${releaseName} ${releaseVersion} (${releaseCommand}), Node ${process.versions.node}, ${process.platform}-${process.arch}`,
        ),
    ]
    if (Either.isLeft(input.settings)) {
        checks.push(check('Configuration', 'error', input.settings.left.message))
    } else {
        const settings = input.settings.right
        checks.push(
            check('Configuration', 'ok', settings.configFile ?? 'No configuration file'),
            yield* checkDataDirectory(settings.dataDir.value),
            yield* checkPort(settings),
        )
    }
    if (paths.mode === 'production') {
        checks.push(
            yield* checkFile(
                'Web interface',
                join(paths.frontendDistPath, 'index.html'),
                'Reinstall the server.',
            ),
        )
    }
    checks.push(
        yield* checkFile('Database migrations', paths.migrationsFolder, 'Reinstall the server.'),
    )
    const worker = yield* checkWorkerExecutable(paths)
    checks.push(worker.check)
    if (worker.workerPath) checks.push(...(yield* checkCapture(paths, worker.workerPath)))
    return checks
})
