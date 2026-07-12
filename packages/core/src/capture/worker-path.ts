import { existsSync } from 'node:fs'
import { dirname, isAbsolute, join, parse, resolve } from 'node:path'

const workerRelativePaths = (platform: NodeJS.Platform) => {
    const executable =
        platform === 'win32' ? 'pruftnet_capture_worker.exe' : 'pruftnet_capture_worker'
    return [
        join('packages', 'core', 'cpp', 'build', executable),
        join('packages', 'core', 'cpp', 'build', 'Debug', executable),
        join('packages', 'core', 'cpp', 'build', 'Release', executable),
    ]
}

export function resolveCaptureWorkerPath(
    startDirectory: string,
    override = process.env.PRUFTNET_CAPTURE_WORKER_PATH,
    platform = process.platform,
    fileExists: (path: string) => boolean = existsSync,
) {
    if (override) return isAbsolute(override) ? override : resolve(startDirectory, override)

    const searched: string[] = []
    let directory = resolve(startDirectory)
    const root = parse(directory).root
    while (true) {
        for (const relativePath of workerRelativePaths(platform)) {
            const candidate = join(directory, relativePath)
            searched.push(candidate)
            if (fileExists(candidate)) return candidate
        }
        if (directory === root) break
        directory = dirname(directory)
    }

    throw new Error(
        `Capture worker executable was not found. Build the pruftnet_capture_worker CMake target or set PRUFTNET_CAPTURE_WORKER_PATH. Searched: ${searched.join(', ')}`,
    )
}
