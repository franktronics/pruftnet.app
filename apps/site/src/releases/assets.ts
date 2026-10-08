export type Platform = 'macos' | 'windows' | 'linux'
export type Architecture = 'x64' | 'arm64'
export type Distribution = 'desktop' | 'server'
export type PackageFormat = 'dmg' | 'zip' | 'exe' | 'deb' | 'appimage' | 'tar.gz'

export interface ReleaseFile {
    name: string
    url: string
    size: number
    sha256: string | null
}

export interface ReleaseAsset extends ReleaseFile {
    distribution: Distribution
    platform: Platform
    arch: Architecture
    format: PackageFormat
}

export const platforms: readonly Platform[] = ['macos', 'windows', 'linux']

export const platformLabels: Record<Platform, string> = {
    macos: 'macOS',
    windows: 'Windows',
    linux: 'Linux',
}

export const formatLabels: Record<PackageFormat, string> = {
    dmg: 'Disk image',
    zip: 'Zip archive',
    exe: 'Installer',
    deb: 'Debian package',
    appimage: 'AppImage',
    'tar.gz': 'Tarball',
}

// Platform and architecture spellings differ between electron-builder (${os}/${arch} plus the
// Debian and AppImage conventions) and the server packager (process.platform/process.arch).
const platformTokens: Record<string, Platform> = {
    mac: 'macos',
    darwin: 'macos',
    win: 'windows',
    win32: 'windows',
    linux: 'linux',
}

const archTokens: Record<string, Architecture> = {
    x64: 'x64',
    amd64: 'x64',
    x86_64: 'x64',
    arm64: 'arm64',
    aarch64: 'arm64',
}

const formatTokens: Record<string, PackageFormat> = {
    dmg: 'dmg',
    zip: 'zip',
    exe: 'exe',
    deb: 'deb',
    appimage: 'appimage',
    'tar.gz': 'tar.gz',
}

// Mirrors the artifact names produced by scripts/distribution/package.mjs:
// pruftnet-{desktop|server}[-nightly]-{version}-{platform}-{arch}.{ext}
const artifactPattern =
    /^pruftnet-(desktop|server)(?:-nightly)?-\d[\w.-]*?-(mac|darwin|win32|win|linux)-(x64|amd64|x86_64|arm64|aarch64)\.(dmg|zip|exe|deb|AppImage|tar\.gz)$/

export function parseReleaseAsset(file: ReleaseFile): ReleaseAsset | null {
    const match = artifactPattern.exec(file.name)
    if (!match) return null
    const [, distribution, platform, arch, extension] = match
    return {
        ...file,
        distribution: distribution as Distribution,
        platform: platformTokens[platform!]!,
        arch: archTokens[arch!]!,
        format: formatTokens[extension!.toLowerCase()]!,
    }
}

const formatOrder: PackageFormat[] = ['dmg', 'exe', 'deb', 'appimage', 'tar.gz', 'zip']

/** Stable display order: preferred installer first, then x64 before arm64. */
export function compareAssets(
    left: Pick<ReleaseAsset, 'format' | 'arch'>,
    right: Pick<ReleaseAsset, 'format' | 'arch'>,
): number {
    return (
        formatOrder.indexOf(left.format) - formatOrder.indexOf(right.format) ||
        Number(left.arch === 'arm64') - Number(right.arch === 'arm64')
    )
}
