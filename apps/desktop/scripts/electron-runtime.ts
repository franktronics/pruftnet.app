import { spawnSync } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import * as NodeOS from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const hostPlatform = NodeOS.platform()
const scriptsDir = dirname(fileURLToPath(import.meta.url))

export const desktopDir = resolve(scriptsDir, '..')

export function resolveElectronPath() {
    const electronPath = require('electron') as unknown
    if (typeof electronPath !== 'string' || electronPath.length === 0) {
        throw new Error('Could not resolve the Electron runtime path.')
    }

    return electronPath
}

function linuxSandboxIsConfigured(electronPath: string) {
    if (hostPlatform !== 'linux') {
        return true
    }

    const sandboxPath = join(dirname(electronPath), 'chrome-sandbox')
    if (!existsSync(sandboxPath)) {
        return false
    }

    const sandboxStat = statSync(sandboxPath)
    return sandboxStat.uid === 0 && (sandboxStat.mode & 0o4777) === 0o4755
}

function resolveLinuxSandboxArgs(electronPath: string) {
    if (linuxSandboxIsConfigured(electronPath)) {
        return []
    }

    console.warn(
        '[desktop] Electron chrome-sandbox is not root-owned with mode 4755; launching local Electron with --no-sandbox.',
    )
    return ['--no-sandbox']
}

export function resolveElectronLaunchCommand(args: readonly string[] = []) {
    const electronPath = resolveElectronPath()

    return {
        electronPath,
        args: [...resolveLinuxSandboxArgs(electronPath), ...args],
    }
}

export function killChildTreeByPid(pid: number | undefined, signal: string) {
    if (hostPlatform === 'win32' || typeof pid !== 'number') {
        return
    }

    spawnSync('pkill', [`-${signal.replace(/^SIG/, '')}`, '-P', String(pid)], { stdio: 'ignore' })
}
