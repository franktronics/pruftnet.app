import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { root, run } from './common.mjs'

export async function stageRuntime(destination) {
    const version = (await readFile(join(root, '.node-version'), 'utf8')).trim()
    const name = `node-v${version}-${process.platform}-${process.arch}`
    const archive = `${name}.${process.platform === 'win32' ? 'zip' : 'tar.gz'}`
    const expected = (await readFile(join(root, 'scripts/distribution/node-shasums.txt'), 'utf8'))
        .split('\n')
        .find((line) => line.endsWith(`  ${archive}`))
        ?.split('  ')[0]
    if (!expected) throw new Error(`No pinned checksum for ${archive}`)
    const cache = join(root, 'build/node-runtime')
    await mkdir(cache, { recursive: true })
    const path = join(cache, archive)
    if (!existsSync(path)) {
        const response = await fetch(`https://nodejs.org/dist/v${version}/${archive}`)
        if (!response.ok) throw new Error(`Node download failed: ${response.status}`)
        await writeFile(path, Buffer.from(await response.arrayBuffer()))
    }
    if (
        createHash('sha256')
            .update(await readFile(path))
            .digest('hex') !== expected
    ) {
        throw new Error('Node runtime checksum mismatch')
    }
    run('tar', ['-xf', path, '-C', cache])
    await mkdir(destination, { recursive: true })
    const executable = process.platform === 'win32' ? 'node.exe' : 'bin/node'
    await cp(
        join(cache, name, executable),
        join(destination, process.platform === 'win32' ? 'node.exe' : 'node'),
    )
    await cp(join(cache, name, 'LICENSE'), join(destination, 'LICENSE'))
    return version
}
