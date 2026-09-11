import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { root, metadata, run } from './common.mjs'
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
    executable = join(
        output,
        process.arch === 'arm64' ? 'linux-arm64-unpacked' : 'linux-unpacked',
        `pruftnet-desktop${meta.suffix}`,
    )
}
run(executable, ['--smoke-test'], {
    timeout: 30000,
    killSignal: 'SIGKILL',
    env: { ...process.env, PRUFTNET_DATA_DIR: join(root, 'build/smoke-desktop-data') },
})
