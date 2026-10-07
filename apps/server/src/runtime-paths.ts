import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { captureWorkerExecutableName } from '@repo/core'

export type ServerMode = 'development' | 'production'

/** Install layout of the server. Not user configuration: see `#server/settings`. */
export interface RuntimePaths {
    readonly mode: ServerMode
    readonly workspaceRoot: string
    readonly frontendRootPath: string
    readonly frontendViteConfigPath: string
    readonly frontendDistPath: string
    readonly migrationsFolder: string
    /** Bundled worker in production; source checkouts search the CMake build tree. */
    readonly captureWorkerPath: string | undefined
}

// Production code is bundled into `app/main.js`, next to `front/`, `drizzle/` and `native/`.
const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url))
const applicationRoot = fileURLToPath(new URL('./', import.meta.url))

export function resolveRuntimePaths(): RuntimePaths {
    const environment = process.env
    // The production build replaces this exact expression, so it must not go through a variable.
    const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development'
    return {
        mode,
        workspaceRoot,
        frontendRootPath:
            environment.FRONTEND_ROOT_PATH ?? resolve(workspaceRoot, 'packages/front'),
        frontendViteConfigPath:
            environment.FRONTEND_VITE_CONFIG_PATH ??
            resolve(workspaceRoot, 'packages/front/vite.config.ts'),
        frontendDistPath: environment.FRONTEND_DIST_PATH ?? resolve(applicationRoot, 'front'),
        migrationsFolder:
            environment.PRUFTNET_MIGRATIONS_DIR ??
            (mode === 'production'
                ? resolve(applicationRoot, 'drizzle')
                : resolve(workspaceRoot, 'packages/core/drizzle')),
        captureWorkerPath:
            mode === 'production'
                ? resolve(applicationRoot, 'native', captureWorkerExecutableName())
                : undefined,
    }
}
