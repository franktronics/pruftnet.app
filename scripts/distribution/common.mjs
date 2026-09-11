import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const root = fileURLToPath(new URL('../../', import.meta.url))
export function run(command, args, options = {}) {
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', ...options })
    if (result.error) throw result.error
    if (result.status !== 0)
        throw new Error(`${command} failed (${result.status ?? result.signal})`)
    return result.stdout?.toString().trim()
}
export function metadata(env = process.env) {
    const version =
        env.PRUFTNET_VERSION ||
        JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).version
    if (!/^0\.\d+\.\d+(?:-nightly\.\d{8}\.\d+)?$/.test(version))
        throw new Error(`Invalid release version: ${version}`)
    const channel = version.includes('-nightly.') ? 'nightly' : 'main'
    if (env.PRUFTNET_CHANNEL && env.PRUFTNET_CHANNEL !== channel)
        throw new Error('Version and channel disagree')
    const suffix = channel === 'nightly' ? '-nightly' : ''
    return {
        version,
        channel,
        suffix,
        name: `Pruftnet${suffix ? ' Nightly' : ''}`,
        command: `pruftnet${suffix}`,
    }
}
export function pnpm(args, options = {}) {
    // Use the package manager's JS entrypoint, avoiding cmd.exe argument interpretation.
    const entry = process.env.npm_execpath
    if (!entry)
        throw new Error('Run this command through pnpm (pnpm build or pnpm package:server).')
    return run(process.execPath, [entry, ...args], options)
}
