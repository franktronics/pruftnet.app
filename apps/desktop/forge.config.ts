import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerDMG } from '@electron-forge/maker-dmg'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives'
import { FuseV1Options, FuseVersion } from '@electron/fuses'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const config: ForgeConfig = {
    packagerConfig: {
        name: 'Pruftnet',
        executableName: 'pruftnet',
        asar: {
            unpack: '**/*.node',
        },
        extraResource: [
            // Native C++ addon
            '../../packages/core-cpp/build/Release/repo-core.node',
            // Protocol JSON files — included before signing so signature stays valid
            '../../packages/core-node/assets/protocols',
        ],
        icon: 'assets/icons/icon',
    },
    rebuildConfig: {},
    hooks: {
        // FusesPlugin modifies the binary after electron-forge's initial signing,
        // invalidating the signature on macOS. Re-sign with ad-hoc after packaging.
        postPackage: async (_config, { outputPaths, platform }) => {
            if (platform !== 'darwin') return
            for (const outputPath of outputPaths) {
                const appBundle = fs.readdirSync(outputPath).find((f) => f.endsWith('.app'))
                if (!appBundle) continue
                const appPath = path.join(outputPath, appBundle)
                console.log(`\n✓ Re-signing ${appBundle} (ad-hoc)...`)
                execSync(`codesign --sign - --force --deep "${appPath}"`, { stdio: 'inherit' })
            }
        },
    },
    makers: [
        // Windows — produces a Squirrel installer (.exe)
        new MakerSquirrel({
            name: 'Pruftnet',
        }),
        // macOS — produces a .dmg installer
        new MakerDMG(
            {
                name: 'Pruftnet',
                overwrite: true,
            },
            ['darwin'],
        ),
        // macOS + Linux — produces a .zip
        new MakerZIP({}, ['darwin', 'linux']),
        // Linux — produces a .deb package
        new MakerDeb({
            options: {
                name: 'pruftnet',
                productName: 'Pruftnet',
                bin: 'pruftnet',
                maintainer: 'Franktronics',
                homepage: 'https://pruftnet.app',
                icon: 'assets/icons/icon.png',
            },
        }),
    ],
    plugins: [
        new AutoUnpackNativesPlugin({}),
        new VitePlugin({
            build: [
                {
                    entry: 'src/main.ts',
                    config: 'config/vite.main.config.ts',
                    target: 'main',
                },
                {
                    entry: 'src/preload.ts',
                    config: 'config/vite.preload.config.ts',
                    target: 'preload',
                },
            ],
            renderer: [
                {
                    name: 'main_window',
                    config: 'config/vite.renderer.config.ts',
                },
            ],
        }),
        new FusesPlugin({
            version: FuseVersion.V1,
            [FuseV1Options.RunAsNode]: false,
            [FuseV1Options.EnableCookieEncryption]: true,
            [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
            [FuseV1Options.EnableNodeCliInspectArguments]: false,
            [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
            [FuseV1Options.OnlyLoadAppFromAsar]: true,
        }),
    ],
}

export default config
