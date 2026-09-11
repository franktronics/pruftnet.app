import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse } from 'yaml'
import { root, metadata, pnpm, run } from './common.mjs'
import { stageNative } from './native.mjs'
import { stageRuntime } from './runtime.mjs'

const meta = metadata()
Object.assign(process.env, { PRUFTNET_VERSION: meta.version, PRUFTNET_CHANNEL: meta.channel })
const output = join(root, 'release')
const staging = join(root, 'build/distribution')
await mkdir(output, { recursive: true })
await mkdir(staging, { recursive: true })
const native = join(staging, 'native')
await stageNative(native)

if (process.argv[2] !== 'desktop') {
    pnpm(['--filter', '@repo/front', 'build'])
    pnpm(['--filter', '@repo/server', 'build'])
    const name = `pruftnet-server${meta.suffix}-${meta.version}-${process.platform}-${process.arch}`
    const directory = join(staging, name)
    await rm(directory, { recursive: true, force: true })
    await mkdir(join(directory, 'runtime'), { recursive: true })
    await cp(join(root, 'apps/server/dist'), join(directory, 'app'), { recursive: true })
    await cp(join(root, 'packages/front/dist'), join(directory, 'app/front'), { recursive: true })
    await cp(native, join(directory, 'app/native'), { recursive: true })
    const nodeVersion = await stageRuntime(join(directory, 'runtime'))
    await writeFile(join(directory, 'app/package.json'), '{"type":"module"}\n')
    await cp(join(root, 'LICENSE'), join(directory, 'LICENSE'))
    await cp(join(root, '.agents/doc/installation.md'), join(directory, 'INSTALL.md'))
    await writeFile(
        join(directory, 'release.json'),
        JSON.stringify({ ...meta, node: nodeVersion }, null, 2) + '\n',
    )
    if (process.platform === 'win32') {
        await writeFile(
            join(directory, `${meta.command}.cmd`),
            `@echo off\r\n"%~dp0runtime\\node.exe" "%~dp0app\\main.js" %*\r\n`,
        )
        run('tar', ['-a', '-c', '-f', join(output, `${name}.zip`), '-C', staging, name])
    } else {
        await writeFile(
            join(directory, meta.command),
            `#!/bin/sh\nset -eu\nROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec "$ROOT/runtime/node" "$ROOT/app/main.js" "$@"\n`,
        )
        await chmod(join(directory, meta.command), 0o755)
        await chmod(join(directory, 'runtime/node'), 0o755)
        run('tar', ['-czf', join(output, `${name}.tar.gz`), '-C', staging, name])
        if (process.platform === 'linux') {
            const debRoot = join(staging, 'server-deb')
            await rm(debRoot, { recursive: true, force: true })
            await mkdir(join(debRoot, 'DEBIAN'), { recursive: true })
            await mkdir(join(debRoot, 'usr/bin'), { recursive: true })
            await cp(directory, join(debRoot, `opt/pruftnet-server${meta.suffix}`), {
                recursive: true,
            })
            await writeFile(
                join(debRoot, `usr/bin/${meta.command}`),
                `#!/bin/sh\nexec /opt/pruftnet-server${meta.suffix}/${meta.command} "$@"\n`,
            )
            await chmod(join(debRoot, `usr/bin/${meta.command}`), 0o755)
            const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
            await writeFile(
                join(debRoot, 'DEBIAN/control'),
                `Package: pruftnet-server${meta.suffix}\nVersion: ${meta.version.replace('-nightly.', '~nightly.')}\nArchitecture: ${arch}\nMaintainer: Franklin Tenepo\nDepends: libc6 (>= 2.39), libstdc++6, libpcap0.8t64\nSection: net\nPriority: optional\nDescription: Pruftnet local web server (beta)\n`,
            )
            run('dpkg-deb', ['--build', '--root-owner-group', debRoot, join(output, `${name}.deb`)])
        }
    }
    await writeFile(join(staging, 'server-path.txt'), directory)
}
if (process.argv[2] !== 'server') {
    const config = parse(await readFile(join(root, 'apps/desktop/electron-builder.yml'), 'utf8'))
    config.productName = meta.name
    config.appId = `app.pruftnet.desktop${meta.suffix ? '.nightly' : ''}`
    config.extraMetadata = {
        version: meta.version,
        name: `pruftnet-desktop${meta.suffix}`,
        dependencies: {},
    }
    config.files.push('!**/node_modules/**/*')
    config.npmRebuild = false
    config.publish = null
    config.directories.output = output
    config.extraResources.push({ from: native, to: 'native' })
    config.linux.executableName = `pruftnet-desktop${meta.suffix}`
    config.nsis.shortcutName = meta.name
    config.mac.identity = '-'
    config.mac.hardenedRuntime = false
    config.mac.notarize = false
    const artifact = `pruftnet-desktop${meta.suffix}-${meta.version}-\${os}-\${arch}.\${ext}`
    config.artifactName = artifact
    for (const key of ['dmg', 'win', 'linux', 'appImage', 'deb'])
        config[key].artifactName = artifact
    config.deb.depends = [
        'libgtk-3-0',
        'libnotify4',
        'libnss3',
        'libxss1',
        'libxtst6',
        'xdg-utils',
        'libatspi2.0-0',
        'libuuid1',
        'libsecret-1-0',
        'libgbm1',
        'libasound2t64',
        'libpcap0.8t64',
    ]
    await writeFile(join(staging, 'electron-builder.json'), JSON.stringify(config, null, 2))
    pnpm([
        '--filter',
        '@repo/desktop',
        'build',
        '--config',
        join(staging, 'electron-builder.json'),
        '--publish',
        'never',
    ])
}
