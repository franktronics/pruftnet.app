import { cond } from '@repo/utils'

import type { Architecture, PackageFormat, Platform, ReleaseFile } from './assets'

/** The last release of the archived 0.1 application (branch dev-archive). It never changes. */
export const LEGACY_RELEASE_TAG = 'v0.1.2'

export interface LegacyAsset extends ReleaseFile {
    platform: Platform
    arch: Architecture
    format: PackageFormat
    server: boolean
}

const extensions: [string, PackageFormat][] = [
    ['.tar.gz', 'tar.gz'],
    ['.dmg', 'dmg'],
    ['.exe', 'exe'],
    ['.deb', 'deb'],
    ['.rpm', 'rpm'],
    ['.appimage', 'appimage'],
    ['.zip', 'zip'],
]

// The 0.1 packaging used Electron Forge defaults, e.g. Pruftnet-x64.dmg, Pruftnet-0.1.2.Setup-arm64.exe,
// pruftnet_0.1.2_amd64.deb, Pruftnet-darwin-arm64-0.1.2.zip and pruftnet-server-linux-x64-0.0.1.tar.gz.
export function parseLegacyAsset(file: ReleaseFile): LegacyAsset | null {
    const name = file.name.toLowerCase()
    const format = extensions.find(([extension]) => name.endsWith(extension))?.[1]
    if (!format) return null
    const platform = cond<Platform>(
        [format === 'dmg' || /darwin|mac/.test(name), 'macos'],
        [format === 'exe' || /win/.test(name), 'windows'],
        [['deb', 'rpm', 'appimage'].includes(format) || /linux/.test(name), 'linux'],
    )
    if (!platform) return null
    return {
        ...file,
        platform,
        arch: /arm64|aarch64/.test(name) ? 'arm64' : 'x64',
        format,
        server: name.includes('server'),
    }
}
