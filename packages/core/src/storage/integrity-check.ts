import { Worker } from 'node:worker_threads'

// Self-contained so the same worker runs from source and from bundled Electron/server builds.
function runIntegrityCheck() {
    const { parentPort, workerData } = process.getBuiltinModule('node:worker_threads')
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite')
    const db = new DatabaseSync(workerData.path, { timeout: 5_000 })
    try {
        const row = db.prepare('PRAGMA integrity_check').get()
        parentPort!.postMessage(row ? Object.values(row)[0] : undefined)
    } finally {
        db.close()
    }
}

/**
 * Runs `PRAGMA integrity_check` on a worker thread. The check reads the whole file, so on the
 * Electron main thread it would also block the window from loading.
 */
export function checkDatabaseIntegrity(path: string) {
    return new Promise<void>((resolve, reject) => {
        const worker = new Worker(`(${runIntegrityCheck.toString()})()`, {
            eval: true,
            workerData: { path },
            execArgv: [],
        })
        let result: unknown
        worker.once('message', (message: unknown) => {
            result = message
        })
        worker.once('error', reject)
        worker.once('exit', () => {
            if (result === 'ok') resolve()
            else reject(new Error('SQLite integrity check failed.'))
        })
    })
}
