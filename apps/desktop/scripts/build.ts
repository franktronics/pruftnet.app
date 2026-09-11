import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptsDir = dirname(fileURLToPath(import.meta.url))
const desktopDir = resolve(scriptsDir, '..')
function getPnpmEntrypoint(): string {
    const entrypoint = process.env.npm_execpath
    if (!entrypoint) throw new Error('Run the desktop build through pnpm.')
    return entrypoint
}
const pnpmEntrypoint = getPnpmEntrypoint()

function createBuildEnv() {
    const buildEnv: NodeJS.ProcessEnv = { ...process.env }
    delete buildEnv.VITE_DEV_SERVER_URL

    for (const [key, value] of Object.entries(buildEnv)) {
        if (value === '') {
            delete buildEnv[key]
        }
    }

    buildEnv.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    delete buildEnv.CSC_LINK
    delete buildEnv.CSC_KEY_PASSWORD
    delete buildEnv.APPLE_API_KEY
    delete buildEnv.APPLE_API_KEY_ID
    delete buildEnv.APPLE_API_ISSUER

    return buildEnv
}

function run(label: string, command: string, args: readonly string[], env: NodeJS.ProcessEnv) {
    return new Promise<void>((resolveRun, rejectRun) => {
        const child = spawn(command, [pnpmEntrypoint, ...args], {
            cwd: desktopDir,
            env,
            stdio: 'inherit',
        })

        child.once('error', rejectRun)
        child.once('exit', (code, signal) => {
            if (signal) {
                rejectRun(new Error(`${label} exited with signal ${signal}`))
                return
            }

            if (code !== 0) {
                rejectRun(new Error(`${label} exited with code ${code ?? 'unknown'}`))
                return
            }

            resolveRun()
        })
    })
}

const buildEnv = createBuildEnv()
const builderArgs = process.argv.slice(2)

await run(
    'build main process',
    process.execPath,
    ['exec', 'vite', 'build', '--config', 'config/vite.main.config.ts'],
    buildEnv,
)
await run(
    'build preload',
    process.execPath,
    ['exec', 'vite', 'build', '--config', 'config/vite.preload.config.ts'],
    buildEnv,
)
await run(
    'build renderer',
    process.execPath,
    ['exec', 'vite', 'build', '--config', 'config/vite.renderer.config.ts'],
    buildEnv,
)
await run(
    'electron-builder',
    process.execPath,
    ['exec', 'electron-builder', ...builderArgs],
    buildEnv,
)
