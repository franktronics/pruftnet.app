import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { root, run } from './common.mjs'

const source = (await readFile(join(root, 'build/distribution/server-path.txt'), 'utf8')).trim()
const temp = await mkdtemp(join(tmpdir(), 'pruftnet-install-'))
const installed = join(temp, 'installed app')
let server
try {
    await cp(source, installed, { recursive: true })
    const metadata = JSON.parse(await readFile(join(installed, 'release.json'), 'utf8'))
    const node = join(installed, 'runtime', process.platform === 'win32' ? 'node.exe' : 'node')
    const main = join(installed, 'app/main.js')
    const env = { ...process.env, NODE_PATH: '', PRUFTNET_DATA_DIR: join(temp, 'data') }
    delete env.PRUFTNET_CAPTURE_WORKER_PATH
    delete env.PRUFTNET_MIGRATIONS_DIR
    delete env.FRONTEND_DIST_PATH
    delete env.HOST
    delete env.PORT
    assert.equal(
        run(node, [main, '--version'], { cwd: temp, env, stdio: 'pipe' }),
        `${metadata.name} ${metadata.version}`,
    )
    const port = 19000 + Math.floor(Math.random() * 20000)
    let logs = ''
    server = spawn(node, [main, 'serve', '--port', String(port)], {
        cwd: temp,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
    })
    server.stdout.on('data', (chunk) => {
        logs = (logs + chunk).slice(-16000)
    })
    server.stderr.on('data', (chunk) => {
        logs = (logs + chunk).slice(-16000)
    })
    server.on('error', (error) => {
        logs += error.message
    })
    if (process.argv.includes('--without-npcap')) {
        assert.equal(process.platform, 'win32')
        const [code] = await Promise.race([
            once(server, 'exit'),
            delay(10000).then(() => {
                throw new Error('Missing Npcap did not produce a startup error')
            }),
        ])
        assert.equal(code, 1, logs)
        assert.match(logs, /Npcap is required\. Install it from https:\/\/npcap\.com/)
        console.log(
            `Relocated Windows server ${metadata.version}: version and missing Npcap diagnostic passed`,
        )
    } else {
        let ready = false
        for (let i = 0; i < 100; i++) {
            if (server.exitCode !== null) throw new Error(`Server exited: ${logs}`)
            try {
                const health = await fetch(`http://127.0.0.1:${port}/health`)
                if (health.ok) {
                    ready = true
                    break
                }
            } catch {
                /* Wait for the packaged server to bind. */
            }
            await delay(100)
        }
        assert.ok(ready, `Server did not become ready: ${logs}`)
        const page = await fetch(`http://127.0.0.1:${port}/`)
        assert.equal(page.status, 200)
        const html = await page.text()
        const asset = html.match(/src="([^"]+\.js)"/)
        assert.ok(asset, 'Frontend bundle was not served')
        assert.equal((await fetch(new URL(asset[1], `http://127.0.0.1:${port}/`))).status, 200)
        const exited = once(server, 'exit')
        server.kill('SIGTERM')
        const result = await Promise.race([
            exited,
            delay(10000).then(() => {
                throw new Error('Shutdown timed out')
            }),
        ])
        if (process.platform !== 'win32') assert.equal(result[0], 0, logs)
        console.log(
            `Relocated server ${metadata.version}: runtime, migrations, HTTP, frontend and shutdown passed`,
        )
    }
} finally {
    if (server && server.exitCode === null) server.kill('SIGKILL')
    await rm(temp, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}
