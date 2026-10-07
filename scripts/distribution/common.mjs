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
        // Must match releaseAppId in packages/core/src/distribution.ts.
        appId: `app.pruftnet.desktop${suffix ? '.nightly' : ''}`,
    }
}
/** Channel variant of a packaging asset: `assets/icons/icon.icns` -> `assets/icons/icon-nightly.icns`. */
export function channelAsset(path, meta) {
    return path.replace(/(\.[a-z]+)$/, `${meta.suffix}$1`)
}
/** The README "Install" section, shipped as INSTALL.md inside server archives. */
export function installGuide(
    readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8'),
) {
    // Windows checkouts may convert the README to CRLF.
    const section = readme.replace(/\r\n/g, '\n').match(/^## Install\n[\s\S]*?(?=^## )/m)?.[0]
    if (!section) throw new Error('README.md has no "## Install" section')
    return `# Install Pruftnet\n\n${section.slice('## Install'.length).trim()}\n`
}
export function pnpm(args, options = {}) {
    // Use the package manager's JS entrypoint, avoiding cmd.exe argument interpretation.
    const entry = process.env.npm_execpath
    if (!entry)
        throw new Error('Run this command through pnpm (pnpm build or pnpm package:server).')
    return run(process.execPath, [entry, ...args], options)
}
