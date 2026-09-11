import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { root, run, metadata } from './common.mjs'

const repository = process.env.GITHUB_REPOSITORY
if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository)) throw new Error('Invalid repository')
const pages = join(root, 'build/pages')
const tap = join(root, 'build/tap')
await mkdir(pages, { recursive: true })
await mkdir(join(tap, 'Formula'), { recursive: true })
await mkdir(join(tap, 'Casks'), { recursive: true })
const releases = JSON.parse(
    run('gh', ['api', `repos/${repository}/releases?per_page=100`, '--paginate', '--slurp'], {
        stdio: 'pipe',
    }),
).flat()
for (const channel of ['main', 'nightly']) {
    const release = releases.find(
        (r) =>
            !r.draft &&
            (channel === 'main'
                ? /^v0\.\d+\.\d+$/.test(r.tag_name)
                : /^v0\.\d+\.\d+-nightly\.\d{8}\.\d+$/.test(r.tag_name)) &&
            r.assets.some((a) => a.name === 'distribution.json'),
    )
    if (!release) continue
    const cache = join(root, 'build/repositories', channel)
    await mkdir(cache, { recursive: true })
    run('gh', [
        'release',
        'download',
        release.tag_name,
        '--repo',
        repository,
        '--pattern',
        'distribution.json',
        '--dir',
        cache,
        '--clobber',
    ])
    const manifest = JSON.parse(await readFile(join(cache, 'distribution.json'), 'utf8'))
    const meta = metadata({ PRUFTNET_VERSION: manifest.version })
    if (`v${meta.version}` !== release.tag_name || meta.channel !== channel)
        throw new Error('Release manifest mismatch')
    for (const asset of manifest.assets) {
        if (!/^[a-zA-Z0-9.-]+$/.test(asset.name) || !/^[a-f0-9]{64}$/.test(asset.sha256))
            throw new Error('Invalid asset manifest')
    }
    const asset = (name) => {
        const found = manifest.assets.find((a) => a.name === name)
        if (!found) throw new Error(`Missing package: ${name}`)
        return found
    }
    const url = (name) =>
        `https://github.com/${repository}/releases/download/${release.tag_name}/${name}`
    const server = (os, arch) =>
        asset(`pruftnet-server${meta.suffix}-${meta.version}-${os}-${arch}.tar.gz`)
    const stanza = (a) => `      url "${url(a.name)}"\n      sha256 "${a.sha256}"`
    const formulaName = `pruftnet-server${meta.suffix}`
    const rubyClass = channel === 'main' ? 'PruftnetServer' : 'PruftnetServerNightly'
    await writeFile(
        join(tap, 'Formula', `${formulaName}.rb`),
        `class ${rubyClass} < Formula\n  desc "Pruftnet local web server (beta)"\n  homepage "https://pruftnet.app"\n  version "${meta.version}"\n  license "MIT"\n  on_macos do\n    on_arm do\n${stanza(server('darwin', 'arm64'))}\n    end\n    on_intel do\n${stanza(server('darwin', 'x64'))}\n    end\n  end\n  on_linux do\n    depends_on "libpcap"\n    on_arm do\n${stanza(server('linux', 'arm64'))}\n    end\n    on_intel do\n${stanza(server('linux', 'x64'))}\n    end\n  end\n  def install\n    libexec.install Dir["*"]\n    (bin/"${meta.command}").write <<~SH\n      #!/bin/sh\n      exec "#{libexec}/${meta.command}" "$@"\n    SH\n  end\n  test do\n    assert_match "${meta.version}", shell_output("#{bin}/${meta.command} --version")\n  end\nend\n`,
    )
    const desktop = (arch) =>
        asset(`pruftnet-desktop${meta.suffix}-${meta.version}-mac-${arch}.dmg`)
    const cask = `pruftnet-desktop${meta.suffix}`
    await writeFile(
        join(tap, 'Casks', `${cask}.rb`),
        `cask "${cask}" do\n  version "${meta.version}"\n  on_arm do\n    url "${url(desktop('arm64').name)}"\n    sha256 "${desktop('arm64').sha256}"\n  end\n  on_intel do\n    url "${url(desktop('x64').name)}"\n    sha256 "${desktop('x64').sha256}"\n  end\n  name "${meta.name}"\n  desc "Network analysis software (beta)"\n  homepage "https://pruftnet.app"\n  app "${meta.name}.app"\n  caveats "Ad-hoc signed beta, without Apple notarization. See the installation guide for Gatekeeper and capture permissions."\nend\n`,
    )
    const pool = join(pages, 'pool', channel)
    await mkdir(pool, { recursive: true })
    for (const a of manifest.assets.filter((a) => a.name.endsWith('.deb'))) {
        run('gh', [
            'release',
            'download',
            release.tag_name,
            '--repo',
            repository,
            '--pattern',
            a.name,
            '--dir',
            pool,
            '--clobber',
        ])
        const digest = createHash('sha256')
            .update(await readFile(join(pool, a.name)))
            .digest('hex')
        if (digest !== a.sha256) throw new Error(`Checksum mismatch: ${a.name}`)
    }
    for (const arch of ['amd64', 'arm64']) {
        const folder = join(pages, 'dists', channel, 'main', `binary-${arch}`)
        await mkdir(folder, { recursive: true })
        const packages =
            run('dpkg-scanpackages', ['--arch', arch, `pool/${channel}`, '/dev/null'], {
                cwd: pages,
                stdio: ['ignore', 'pipe', 'inherit'],
            }) + '\n'
        await writeFile(join(folder, 'Packages'), packages)
        run('gzip', ['-k', '-f', join(folder, 'Packages')])
    }
    const releaseFile = join(pages, 'dists', channel, 'Release')
    const contents =
        run(
            'apt-ftparchive',
            [
                '-o',
                'APT::FTPArchive::Release::Origin=Pruftnet',
                '-o',
                `APT::FTPArchive::Release::Suite=${channel}`,
                '-o',
                `APT::FTPArchive::Release::Codename=${channel}`,
                '-o',
                'APT::FTPArchive::Release::Architectures=amd64 arm64',
                '-o',
                'APT::FTPArchive::Release::Components=main',
                'release',
                `dists/${channel}`,
            ],
            { cwd: pages, stdio: 'pipe' },
        ) + '\n'
    await writeFile(releaseFile, contents)
    run('gpg', [
        '--batch',
        '--yes',
        '--armor',
        '--detach-sign',
        '--output',
        `${releaseFile}.gpg`,
        releaseFile,
    ])
    run('gpg', [
        '--batch',
        '--yes',
        '--clearsign',
        '--output',
        join(pages, 'dists', channel, 'InRelease'),
        releaseFile,
    ])
}
await writeFile(
    join(pages, 'pruftnet.asc'),
    run('gpg', ['--armor', '--export'], { stdio: 'pipe' }) + '\n',
)
await writeFile(
    join(pages, 'index.html'),
    '<!doctype html><html lang="en"><meta charset="utf-8"><title>Pruftnet packages</title><h1>Pruftnet packages</h1><p>Signed APT repository. See the <a href="https://github.com/' +
        repository +
        '/blob/main/.agents/doc/installation.md">installation guide</a>.</p></html>',
)
await writeFile(
    join(tap, 'README.md'),
    '# Pruftnet Homebrew tap\n\nInstall Desktop: `brew install --cask franktronics/pruftnet/pruftnet-desktop`\n\nInstall Server: `brew install franktronics/pruftnet/pruftnet-server`\n\nAppend `-nightly` to a package name for the nightly channel.\n\nSee https://github.com/' +
        repository +
        '/blob/main/.agents/doc/installation.md for capture permissions and unsigned beta installation.\n',
)
