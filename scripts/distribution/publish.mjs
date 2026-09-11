import { createHash } from 'node:crypto'
import { appendFile, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { metadata, root, run } from './common.mjs'

const meta = metadata()
const directory = join(root, 'release')
const names = (await readdir(directory))
    .filter((name) => /\.(dmg|zip|exe|AppImage|deb|rpm|tar\.gz)$/.test(name))
    .sort()
for (const [os, arch] of [
    ['darwin', 'arm64'],
    ['darwin', 'x64'],
    ['linux', 'x64'],
    ['linux', 'arm64'],
    ['win32', 'x64'],
]) {
    const ext = os === 'win32' ? 'zip' : 'tar.gz'
    if (!names.includes(`pruftnet-server${meta.suffix}-${meta.version}-${os}-${arch}.${ext}`))
        throw new Error(`Missing server ${os}-${arch}`)
    const desktopOS = { darwin: 'mac', linux: 'linux', win32: 'win' }[os]
    const desktopExt = { darwin: 'dmg', linux: 'deb', win32: 'exe' }[os]
    if (
        !names.includes(
            `pruftnet-desktop${meta.suffix}-${meta.version}-${desktopOS}-${arch}.${desktopExt}`,
        )
    )
        throw new Error(`Missing desktop ${os}-${arch}`)
}
const assets = await Promise.all(
    names.map(async (name) => ({
        name,
        sha256: createHash('sha256')
            .update(await readFile(join(directory, name)))
            .digest('hex'),
    })),
)
await writeFile(
    join(directory, 'SHA256SUMS'),
    assets.map(({ name, sha256 }) => `${sha256}  ${name}\n`).join(''),
)
await writeFile(
    join(directory, 'distribution.json'),
    JSON.stringify({ ...meta, commit: process.env.RELEASE_COMMIT, assets }, null, 2) + '\n',
)
const notes = join(directory, 'notes.md')
await writeFile(
    notes,
    `Pruftnet ${meta.version} (beta)\n\nDesktop and local web server for macOS Intel/Apple Silicon, Linux x64/ARM64 and Windows x64.\n\n- macOS builds are ad-hoc signed, without Developer ID or notarization. Gatekeeper may block opening.\n- Windows requires a separate Npcap installation; the application is currently unsigned.\n- Linux live capture requires worker capabilities.\n- Main and nightly installations and data are isolated. No in-app auto-update yet.\n\nSee [installation instructions](https://github.com/${process.env.GITHUB_REPOSITORY}/blob/v${meta.version}/.agents/doc/installation.md).\n\nCommit: ${process.env.RELEASE_COMMIT}\n`,
)
const tag = `v${meta.version}`
run('gh', [
    'release',
    'create',
    tag,
    '--target',
    process.env.RELEASE_COMMIT,
    '--draft',
    '--title',
    `${meta.name} ${meta.version} (beta)`,
    '--notes-file',
    notes,
    ...(meta.channel === 'nightly' ? ['--prerelease'] : []),
])
run('gh', [
    'release',
    'upload',
    tag,
    ...names.map((name) => join(directory, name)),
    join(directory, 'SHA256SUMS'),
    join(directory, 'distribution.json'),
])
run('gh', ['release', 'edit', tag, '--draft=false', `--latest=${meta.channel === 'main'}`])
await appendFile(process.env.GITHUB_OUTPUT, `tag=${tag}\n`)
