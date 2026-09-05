import { Worker } from 'node:worker_threads'
import type { SQLInputValue } from 'node:sqlite'

export interface SummaryIndexQuery {
    key: string
    preview?: boolean
    sql: string
    params: SQLInputValue[]
    startIndex: number
    limit: number
}

export interface SummaryIndexResult {
    count: number
    indexing: boolean
    indexes: number[]
}

// Self-contained so the same worker runs from source and from bundled Electron/server builds.
function runQueryWorker() {
    const { parentPort, workerData } = process.getBuiltinModule('node:worker_threads')
    const { DatabaseSync } = process.getBuiltinModule('node:sqlite')
    const db = new DatabaseSync(workerData.path, { readOnly: true, timeout: 5_000 })
    db.exec('PRAGMA temp_store = FILE; PRAGMA cache_size = -2048; PRAGMA temp.cache_size = -2048')
    const cached = new Map<string, { table: string; count: number; complete: boolean }>()
    let nextTable = 0
    let retainedRows = 0
    parentPort!.on('message', (message: SummaryIndexQuery & { id: number }) => {
        try {
            let index = cached.get(message.key)
            const preview = !index && message.preview && message.limit > 0
            if (!index || !index.complete) {
                if (index) {
                    db.exec(`DROP TABLE ${index.table}`)
                    retainedRows -= index.count
                    cached.delete(message.key)
                }
                // Store result ordinals in SQLite's temporary database, never one JS object
                // per matching packet. A large result remains pageable after memory eviction.
                const table = `summary_result_${++nextTable}`
                db.exec(
                    `CREATE TEMP TABLE ${table} (position INTEGER PRIMARY KEY, row_index INTEGER NOT NULL)`,
                )
                try {
                    db.prepare(
                        `INSERT INTO ${table}(row_index) ${message.sql}${preview ? ` LIMIT ${message.limit}` : ''}`,
                    ).run(...message.params)
                    const count = Number(
                        db.prepare(`SELECT count(*) AS count FROM ${table}`).get()!.count,
                    )
                    index = { table, count, complete: !preview || count < message.limit }
                    retainedRows += count
                } catch (error) {
                    db.exec(`DROP TABLE ${table}`)
                    throw error
                }
            }
            cached.delete(message.key)
            cached.set(message.key, index)
            while (cached.size > 1 && (cached.size > 8 || retainedRows > 8_000_000)) {
                const oldest = cached.entries().next().value!
                db.exec(`DROP TABLE ${oldest[1].table}`)
                retainedRows -= oldest[1].count
                cached.delete(oldest[0])
            }
            const indexes =
                message.limit === 0
                    ? []
                    : db
                          .prepare(
                              `SELECT row_index FROM ${index.table} WHERE position >= ? ORDER BY position LIMIT ?`,
                          )
                          .all(message.startIndex + 1, message.limit)
                          .map((row) => Number(row.row_index))
            parentPort!.postMessage({
                id: message.id,
                result: { count: index.count, indexes, indexing: !index.complete },
            })
        } catch (error) {
            parentPort!.postMessage({
                id: message.id,
                error: error instanceof Error ? error.message : String(error),
            })
        }
    })
}

export class SummaryQueryWorker {
    private worker: Worker | undefined
    private nextId = 0
    private pending = new Map<
        number,
        { resolve: (value: SummaryIndexResult) => void; reject: (error: Error) => void }
    >()

    private path: string

    constructor(path: string) {
        this.path = path
    }

    private start() {
        if (this.worker) return this.worker
        const worker = new Worker(`(${runQueryWorker.toString()})()`, {
            eval: true,
            workerData: { path: this.path },
            execArgv: [],
        })
        worker.on(
            'message',
            (message: { id: number; result: SummaryIndexResult; error?: string }) => {
                const pending = this.pending.get(message.id)
                if (!pending) return
                this.pending.delete(message.id)
                if (message.error) pending.reject(new Error(message.error))
                else pending.resolve(message.result)
            },
        )
        const fail = (error: Error) => {
            if (this.worker !== worker) return
            this.worker = undefined
            for (const pending of this.pending.values()) pending.reject(error)
            this.pending.clear()
        }
        worker.on('error', fail)
        worker.on('exit', (code) => fail(new Error(`Summary query worker exited (${code}).`)))
        this.worker = worker
        return worker
    }

    query(query: SummaryIndexQuery, signal: AbortSignal): Promise<SummaryIndexResult> {
        return new Promise((resolve, reject) => {
            if (signal.aborted) return reject(new Error('Summary query aborted.'))
            const id = ++this.nextId
            const worker = this.start()
            const abort = () => {
                this.pending.delete(id)
                // The caller serializes queries. Termination cancels SQLite itself instead
                // of leaving obsolete filters queued behind an uninterruptible scan.
                if (this.worker === worker) this.worker = undefined
                void worker.terminate()
                reject(new Error('Summary query aborted.'))
            }
            signal.addEventListener('abort', abort, { once: true })
            this.pending.set(id, {
                resolve: (value) => {
                    signal.removeEventListener('abort', abort)
                    resolve(value)
                },
                reject: (error) => {
                    signal.removeEventListener('abort', abort)
                    reject(error)
                },
            })
            worker.postMessage({ ...query, id })
        })
    }

    async close() {
        await this.worker?.terminate()
    }
}
