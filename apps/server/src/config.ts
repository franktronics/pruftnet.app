import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

function readPort() {
    const port = Number.parseInt(process.env.PORT ?? '3000', 10)

    if (Number.isNaN(port)) {
        return 3000
    }

    return port
}

export function loadServerConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
    const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development'
    const host = overrides.host ?? process.env.HOST ?? '127.0.0.1'
    if (host !== 'localhost' && host !== '::1' && !host.startsWith('127.')) {
        throw new Error(
            'Remote server binding is disabled until capture API authentication is implemented.',
        )
    }

    return {
        mode,
        port: readPort(),
        frontendRootPath:
            process.env.FRONTEND_ROOT_PATH ?? resolve(workspaceRoot, 'packages/front'),
        frontendViteConfigPath:
            process.env.FRONTEND_VITE_CONFIG_PATH ??
            resolve(workspaceRoot, 'packages/front/vite.config.ts'),
        frontendDistPath:
            process.env.FRONTEND_DIST_PATH ?? resolve(workspaceRoot, 'packages/front/dist'),
        workspaceRoot,
        migrationsFolder:
            process.env.PRUFTNET_MIGRATIONS_DIR ??
            resolve(
                workspaceRoot,
                mode === 'production' ? 'apps/server/dist/drizzle' : 'packages/core/drizzle',
            ),
        ...overrides,
        host,
    }
}
