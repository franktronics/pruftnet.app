import type { ForgeConfig } from '@electron-forge/shared-types'
import { MakerSquirrel } from '@electron-forge/maker-squirrel'
import { MakerZIP } from '@electron-forge/maker-zip'
import { MakerDeb } from '@electron-forge/maker-deb'
import { MakerRpm } from '@electron-forge/maker-rpm'
import { VitePlugin } from '@electron-forge/plugin-vite'
import { FusesPlugin } from '@electron-forge/plugin-fuses'
import { AutoUnpackNativesPlugin } from '@electron-forge/plugin-auto-unpack-natives'
import { FuseV1Options, FuseVersion } from '@electron/fuses'
import path from 'node:path'
import fs from 'node:fs'

// Helper to copy directory recursively
function copyDirSync(src: string, dest: string) {
    fs.mkdirSync(dest, { recursive: true })
    const entries = fs.readdirSync(src, { withFileTypes: true })
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name)
        const destPath = path.join(dest, entry.name)
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath)
        } else {
            fs.copyFileSync(srcPath, destPath)
        }
    }
}

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
        ],
    },
    rebuildConfig: {},
    makers: [
        new MakerSquirrel({
            name: 'Pruftnet',
        }),
        new MakerZIP({}, ['darwin', 'linux']),
        new MakerDeb({
            options: {
                name: 'pruftnet',
                productName: 'Pruftnet',
                bin: 'pruftnet',
                maintainer: 'Franktronics',
                homepage: 'https://pruftnet.app',
            },
        }),
        // Uncomment if rpmbuild is installed: new MakerRpm({}),
    ],
    hooks: {
        postPackage: async (_config, { outputPaths }) => {
            for (const outputPath of outputPaths) {
                const resourcesDir = path.join(outputPath, 'resources')

                // Copy protocol JSON files
                const protocolsSrc = path.resolve(
                    __dirname,
                    '../../packages/core-node/assets/protocols',
                )
                const protocolsDest = path.join(resourcesDir, 'assets', 'protocols')
                if (fs.existsSync(protocolsSrc)) {
                    copyDirSync(protocolsSrc, protocolsDest)
                    console.log(`✓ Copied protocols to ${protocolsDest}`)
                }

                // Copy Prisma migrations
                const migrationsSrc = path.resolve(
                    __dirname,
                    '../../packages/core-node/prisma/migrations',
                )
                const migrationsDest = path.join(resourcesDir, 'prisma', 'migrations')
                if (fs.existsSync(migrationsSrc)) {
                    copyDirSync(migrationsSrc, migrationsDest)
                    console.log(`✓ Copied migrations to ${migrationsDest}`)
                }

                // Copy Prisma schema
                const schemaSrc = path.resolve(
                    __dirname,
                    '../../packages/core-node/prisma/schema.prisma',
                )
                const schemaDest = path.join(resourcesDir, 'prisma', 'schema.prisma')
                if (fs.existsSync(schemaSrc)) {
                    fs.mkdirSync(path.dirname(schemaDest), { recursive: true })
                    fs.copyFileSync(schemaSrc, schemaDest)
                    console.log(`✓ Copied schema.prisma to ${path.dirname(schemaDest)}`)
                }
            }
        },
    },
    plugins: [
        new AutoUnpackNativesPlugin({}),
        new VitePlugin({
            // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
            // If you are familiar with Vite configuration, it will look really familiar.
            build: [
                {
                    // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
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
        // Fuses are used to enable/disable various Electron functionality
        // at package time, before code signing the application
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
