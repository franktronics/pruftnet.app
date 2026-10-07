import { parseReleaseAsset, type ReleaseFile } from './assets'
import { parseLegacyAsset } from './legacy'

const file = (name: string): ReleaseFile => ({
    name,
    url: `https://example.test/${name}`,
    size: 1,
    sha256: null,
})

describe('parseReleaseAsset', () => {
    // Every package name published by v0.2.0.
    test.each([
        ['pruftnet-desktop-0.2.0-linux-amd64.deb', 'desktop', 'linux', 'x64', 'deb'],
        ['pruftnet-desktop-0.2.0-linux-arm64.AppImage', 'desktop', 'linux', 'arm64', 'appimage'],
        ['pruftnet-desktop-0.2.0-linux-arm64.deb', 'desktop', 'linux', 'arm64', 'deb'],
        ['pruftnet-desktop-0.2.0-linux-x86_64.AppImage', 'desktop', 'linux', 'x64', 'appimage'],
        ['pruftnet-desktop-0.2.0-mac-arm64.dmg', 'desktop', 'macos', 'arm64', 'dmg'],
        ['pruftnet-desktop-0.2.0-mac-arm64.zip', 'desktop', 'macos', 'arm64', 'zip'],
        ['pruftnet-desktop-0.2.0-mac-x64.dmg', 'desktop', 'macos', 'x64', 'dmg'],
        ['pruftnet-desktop-0.2.0-mac-x64.zip', 'desktop', 'macos', 'x64', 'zip'],
        ['pruftnet-desktop-0.2.0-win-x64.exe', 'desktop', 'windows', 'x64', 'exe'],
        ['pruftnet-server-0.2.0-darwin-arm64.tar.gz', 'server', 'macos', 'arm64', 'tar.gz'],
        ['pruftnet-server-0.2.0-darwin-x64.tar.gz', 'server', 'macos', 'x64', 'tar.gz'],
        ['pruftnet-server-0.2.0-linux-arm64.deb', 'server', 'linux', 'arm64', 'deb'],
        ['pruftnet-server-0.2.0-linux-arm64.tar.gz', 'server', 'linux', 'arm64', 'tar.gz'],
        ['pruftnet-server-0.2.0-linux-x64.deb', 'server', 'linux', 'x64', 'deb'],
        ['pruftnet-server-0.2.0-linux-x64.tar.gz', 'server', 'linux', 'x64', 'tar.gz'],
        ['pruftnet-server-0.2.0-win32-x64.zip', 'server', 'windows', 'x64', 'zip'],
        [
            'pruftnet-desktop-nightly-0.3.0-nightly.20261007.42-mac-arm64.dmg',
            'desktop',
            'macos',
            'arm64',
            'dmg',
        ],
        [
            'pruftnet-server-nightly-0.3.0-nightly.20261007.42-linux-x64.tar.gz',
            'server',
            'linux',
            'x64',
            'tar.gz',
        ],
    ])('%s', (name, distribution, platform, arch, format) => {
        expect(parseReleaseAsset(file(name))).toMatchObject({
            distribution,
            platform,
            arch,
            format,
        })
    })

    test.each(['distribution.json', 'SHA256SUMS', 'pruftnet-desktop-0.2.0-mac-arm64.dmg.blockmap'])(
        'ignores %s',
        (name) => {
            expect(parseReleaseAsset(file(name))).toBeNull()
        },
    )
})

describe('parseLegacyAsset', () => {
    // Every package name published by v0.1.2.
    test.each([
        ['Pruftnet-0.1.2.Setup-arm64.exe', 'windows', 'arm64', 'exe', false],
        ['Pruftnet-0.1.2.Setup-x64.exe', 'windows', 'x64', 'exe', false],
        ['Pruftnet-arm64.dmg', 'macos', 'arm64', 'dmg', false],
        ['Pruftnet-darwin-arm64-0.1.2.zip', 'macos', 'arm64', 'zip', false],
        ['Pruftnet-darwin-x64-0.1.2.zip', 'macos', 'x64', 'zip', false],
        ['Pruftnet-linux-arm64-0.1.2.zip', 'linux', 'arm64', 'zip', false],
        ['Pruftnet-linux-x64-0.1.2.zip', 'linux', 'x64', 'zip', false],
        ['pruftnet-server-linux-x64-0.0.1.tar.gz', 'linux', 'x64', 'tar.gz', true],
        ['Pruftnet-x64.dmg', 'macos', 'x64', 'dmg', false],
        ['pruftnet_0.1.2_amd64.deb', 'linux', 'x64', 'deb', false],
        ['pruftnet_0.1.2_arm64.deb', 'linux', 'arm64', 'deb', false],
    ])('%s', (name, platform, arch, format, server) => {
        expect(parseLegacyAsset(file(name))).toMatchObject({ platform, arch, format, server })
    })
})
