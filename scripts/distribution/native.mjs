import { cp, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { root, run } from './common.mjs'

export async function stageNative(destination) {
    const build = join(root, 'packages/core/cpp/build')
    const args = ['-S', 'packages/core/cpp', '-B', build, '-DCMAKE_BUILD_TYPE=Release']
    if (process.platform === 'darwin') {
        const sdk = run('xcrun', ['--show-sdk-path'], { stdio: 'pipe' })
        args.push(
            `-DPCAP_INCLUDE_DIR=${sdk}/usr/include`,
            `-DPCAP_LIBRARY=${sdk}/usr/lib/libpcap.tbd`,
            '-DCMAKE_OSX_DEPLOYMENT_TARGET=15.0',
        )
    }
    if (process.platform === 'win32') {
        const sdk = process.env.NPCAP_SDK
        if (!sdk) throw new Error('NPCAP_SDK must point to an extracted Npcap SDK')
        args.push(
            `-DPCAP_INCLUDE_DIR=${sdk}/Include`,
            `-DPCAP_LIBRARY=${sdk}/Lib/x64/wpcap.lib`,
            `-DPCAP_PACKET_LIBRARY=${sdk}/Lib/x64/Packet.lib`,
            '-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded',
        )
    }
    run('cmake', args)
    run('cmake', ['--build', build, '--config', 'Release', '--parallel', '3'])
    await mkdir(destination, { recursive: true })
    const worker =
        process.platform === 'win32' ? 'pruftnet_capture_worker.exe' : 'pruftnet_capture_worker'
    await cp(
        join(build, process.platform === 'win32' ? 'Release' : '', worker),
        join(destination, worker),
    )
    if (process.platform === 'darwin')
        run('codesign', ['--force', '--sign', '-', join(destination, worker)])
}
