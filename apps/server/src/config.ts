import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { releaseChannel } from '@repo/core'

export type ServerMode = 'development' | 'production'

export type ServerConfig = {
    readonly mode: ServerMode
    readonly host: string
    readonly port: number
    readonly frontendRootPath: string
    readonly frontendViteConfigPath: string
    readonly frontendDistPath: string
    readonly workspaceRoot: string
    readonly migrationsFolder: string
}

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url))
const applicationRoot = fileURLToPath(new URL('./', import.meta.url))

function readPort(value: unknown) {
    const port = Number(value)
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Port must be an integer between 1 and 65535.')
    }
    return port
}

export function loadServerConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
    const mode =
        overrides.mode ?? (process.env.NODE_ENV === 'production' ? 'production' : 'development')
    const host = overrides.host ?? process.env.HOST ?? '127.0.0.1'
    if (!['localhost', '::1', '127.0.0.1'].includes(host)) {
        throw new Error(
            'Remote server binding is disabled until capture API authentication is implemented.',
        )
    }

    return {
        mode,
        frontendRootPath:
            process.env.FRONTEND_ROOT_PATH ?? resolve(workspaceRoot, 'packages/front'),
        frontendViteConfigPath:
            process.env.FRONTEND_VITE_CONFIG_PATH ??
            resolve(workspaceRoot, 'packages/front/vite.config.ts'),
        frontendDistPath: process.env.FRONTEND_DIST_PATH ?? resolve(applicationRoot, 'front'),
        workspaceRoot,
        migrationsFolder:
            process.env.PRUFTNET_MIGRATIONS_DIR ??
            (mode === 'production'
                ? resolve(applicationRoot, 'drizzle')
                : resolve(workspaceRoot, 'packages/core/drizzle')),
        ...overrides,
        port: readPort(
            overrides.port ?? process.env.PORT ?? (releaseChannel === 'nightly' ? 3001 : 3000),
        ),
        host,
    }
}
