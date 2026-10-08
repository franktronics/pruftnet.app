import { readdir } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { root, metadata } from './common.mjs'
const meta = metadata()
const output = join(root, 'release')
let executable
if (process.platform === 'darwin') {
    const folder = (await readdir(output)).find(
        (name) => name === 'mac' || name === `mac-${process.arch}`,
    )
    if (!folder) throw new Error('Packaged macOS application not found')
    executable = join(output, folder, `${meta.name}.app/Contents/MacOS/${meta.name}`)
} else if (process.platform === 'win32') {
    executable = join(output, 'win-unpacked', `${meta.name}.exe`)
} else {
    executable = process.argv.includes('--installed')
        ? join('/opt', meta.name, `pruftnet-desktop${meta.suffix}`)
        : join(
              output,
              process.arch === 'arm64' ? 'linux-arm64-unpacked' : 'linux-unpacked',
              `pruftnet-desktop${meta.suffix}`,
          )
}
const result = spawnSync(executable, ['--smoke-test'], {
    timeout: 30000,
    killSignal: 'SIGKILL',
    env: { ...process.env, PRUFTNET_DATA_DIR: join(root, 'build/smoke-desktop-data') },
    encoding: 'utf8',
})
const logs = `${result.stdout ?? ''}${result.stderr ?? ''}`
console.log(logs)
if (result.error) throw result.error
if (process.argv.includes('--without-npcap')) {
    assert.equal(process.platform, 'win32')
    assert.equal(result.status, 1, logs)
    assert.match(logs, /Npcap is required\. Install it from https:\/\/npcap\.com/)
} else {
    assert.equal(result.status, 0, logs)
    assert.match(logs, /Smoke: renderer loaded/)
    const startup = JSON.parse(logs.match(/^Smoke: startup (\{.*\})$/m)?.[1] ?? 'null')
    assert.ok(startup, 'Startup timings were not reported')
    console.table(startup)
    // Generous enough for cold CI runners; it catches regressions such as the window waiting
    // for the backend again, not small variations.
    const budgetMs = Number(process.env.PRUFTNET_STARTUP_BUDGET_MS ?? 5000)
    assert.ok(
        startup.appMountedMs <= budgetMs,
        `The application mounted after ${startup.appMountedMs} ms (budget ${budgetMs} ms)`,
    )
}
