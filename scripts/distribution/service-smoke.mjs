// Checks the installed Debian server package: systemd unit, worker capture permissions and
// service startup. Run after `apt-get install ./release/*.deb` on a systemd host.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import { metadata, run } from './common.mjs'

const meta = metadata()
const pkg = `pruftnet-server${meta.suffix}`
const worker = `/opt/${pkg}/app/native/pruftnet_capture_worker`
const capture = (command, args) => {
    const result = spawnSync(command, args, { encoding: 'utf8' })
    return {
        status: result.status,
        stdout: result.stdout,
        output: `${result.stdout}${result.stderr}`,
    }
}

run('systemd-analyze', ['verify', `/usr/lib/systemd/system/${pkg}.service`])
assert.equal(statSync(worker).mode & 0o777, 0o750)
assert.equal(capture('stat', ['-c', '%U:%G', worker]).output.trim(), 'root:pruftnet')
assert.match(capture('getcap', [worker]).output, /cap_net_admin,cap_net_raw[=+]eip/)

try {
    run('sudo', ['systemctl', 'start', `${pkg}.service`])
    let health
    for (let attempt = 0; attempt < 100 && !health; attempt += 1) {
        try {
            const response = await fetch(`http://127.0.0.1:${meta.serverPort}/health`)
            if (response.ok) health = await response.json()
        } catch {
            /* Wait for the service to bind. */
        }
        if (!health) await delay(100)
    }
    assert.ok(health, capture('journalctl', ['-u', `${pkg}.service`, '--no-pager']).output)
    assert.equal(health.version, meta.version)

    const doctor = capture('sudo', [
        '-u',
        'pruftnet',
        meta.command,
        'doctor',
        '--config',
        `/etc/${pkg}/server.json`,
        '--json',
    ])
    const { checks } = JSON.parse(doctor.stdout)
    const failed = checks.filter((check) => check.status === 'error')
    assert.deepEqual(failed, [], JSON.stringify(checks))
    assert.ok(checks.some((check) => check.name === 'Capture permission'))
} finally {
    run('sudo', ['systemctl', 'stop', `${pkg}.service`])
}
assert.notEqual(capture('systemctl', ['is-active', `${pkg}.service`]).status, 0)
console.log(
    `Installed ${pkg} ${meta.version}: unit, worker capabilities, service and doctor passed`,
)
